/**
 * `dogwatch_budget` counter (SPEC §3/§8): the D2 app-level counter checked
 * BEFORE any model call. The SPEC's schema is `dogwatch_budget(day date PK,
 * llm_calls, input_tokens, output_tokens, micro_usd, decide_attempts)` — one
 * Postgres table shared with M5's gate-decide counter. `decide_attempts` is
 * M5 scope (the `/api/gate/decide` counter); this module owns the four
 * llm_* columns.
 *
 * `InMemoryBudgetStore` is the M0-M3 default (per the SPEC's own sequencing
 * note) — it enforces the ≤2-calls-per-run cap (draft is unreachable before
 * M5, so in practice ≤1) honestly, but it is per-PROCESS: a fresh `dogwatch
 * watch` invocation starts a fresh counter, so it cannot enforce the
 * cross-run DAILY ceiling (20 calls/day) — that genuinely needs storage
 * that survives across processes, which is exactly why SPEC §5 puts this
 * table in Neon. `PostgresBudgetStore` is that implementation, fully
 * written against a minimal injectable `SqlExecutor` (no `pg`/`@neondatabase`
 * dependency added for code nothing calls yet) — `createBudgetStore` only
 * ever returns it when a caller supplies BOTH a `databaseUrl` and a real
 * `sqlExecutor`; a `databaseUrl` with no executor is a configuration error,
 * never a silent fallback (SPEC §9: fail closed, never fail silent).
 */

export interface DailyUsage {
  day: string;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  microUsd: number;
}

export interface CallUsage {
  inputTokens: number;
  outputTokens: number;
  microUsd: number;
}

export interface BudgetStore {
  /** Zeros if nothing has been recorded for `day` yet. */
  getUsage(day: string): Promise<DailyUsage>;
  /** Atomically add one call's usage to the day's running total and return
   * the new total — the value the next `isBudgetExceeded` check reads. */
  recordCall(day: string, usage: CallUsage): Promise<DailyUsage>;
}

export interface BudgetCaps {
  maxCallsPerDay: number;
  maxInputTokensPerDay: number;
  maxOutputTokensPerDay: number;
  maxMicroUsdPerDay: number;
}

/** SPEC §8: "daily ceiling 20 calls / 100k input / 20k output / $0.20". */
export const DEFAULT_BUDGET_CAPS: BudgetCaps = {
  maxCallsPerDay: 20,
  maxInputTokensPerDay: 100_000,
  maxOutputTokensPerDay: 20_000,
  maxMicroUsdPerDay: 200_000, // $0.20 in integer micro-USD
};

export function isBudgetExceeded(usage: DailyUsage, caps: BudgetCaps = DEFAULT_BUDGET_CAPS): boolean {
  return (
    usage.llmCalls >= caps.maxCallsPerDay ||
    usage.inputTokens >= caps.maxInputTokensPerDay ||
    usage.outputTokens >= caps.maxOutputTokensPerDay ||
    usage.microUsd >= caps.maxMicroUsdPerDay
  );
}

/** UTC calendar day the counter buckets by — stable regardless of the
 * runner's local timezone (GitHub Actions runners are UTC anyway, but a
 * local `dogwatch watch` invocation must bucket identically). */
export function dayBucket(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function zeroUsage(day: string): DailyUsage {
  return { day, llmCalls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0 };
}

export class InMemoryBudgetStore implements BudgetStore {
  private readonly byDay = new Map<string, DailyUsage>();

  // eslint-disable-next-line @typescript-eslint/require-await -- interface parity with the Postgres implementation
  async getUsage(day: string): Promise<DailyUsage> {
    return this.byDay.get(day) ?? zeroUsage(day);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- interface parity with the Postgres implementation
  async recordCall(day: string, usage: CallUsage): Promise<DailyUsage> {
    const prev = this.byDay.get(day) ?? zeroUsage(day);
    const next: DailyUsage = {
      day,
      llmCalls: prev.llmCalls + 1,
      inputTokens: prev.inputTokens + usage.inputTokens,
      outputTokens: prev.outputTokens + usage.outputTokens,
      microUsd: prev.microUsd + usage.microUsd,
    };
    this.byDay.set(day, next);
    return next;
  }
}

/** The minimal seam a real Postgres/Neon client satisfies (`pg`'s
 * `Pool.query`, `@neondatabase/serverless`'s tagged-template client, or a
 * hand-rolled wrapper) — kept intentionally small so this module adds no
 * heavy dependency for logic nothing calls until M4 wires a real
 * `DATABASE_URL` connection. */
export interface SqlExecutor {
  query<T = Record<string, unknown>>(sql: string, params: readonly unknown[]): Promise<T[]>;
}

interface BudgetRow {
  day: string;
  llm_calls: number;
  input_tokens: number;
  output_tokens: number;
  micro_usd: number;
}

/**
 * The M4 Neon implementation (SPEC §3/§5), fully written now against
 * `SqlExecutor` rather than deferred as a stub — the schema and the queries
 * below are exactly what `db:migrate` (SPEC §3) will create:
 *
 * ```sql
 * create table dogwatch_budget (
 *   day date primary key,
 *   llm_calls int not null default 0,
 *   input_tokens int not null default 0,
 *   output_tokens int not null default 0,
 *   micro_usd bigint not null default 0,
 *   decide_attempts int not null default 0 -- M5's counter, untouched here
 * );
 * ```
 */
export class PostgresBudgetStore implements BudgetStore {
  constructor(private readonly sql: SqlExecutor) {}

  async getUsage(day: string): Promise<DailyUsage> {
    const rows = await this.sql.query<BudgetRow>(
      `select day::text, llm_calls, input_tokens, output_tokens, micro_usd from dogwatch_budget where day = $1`,
      [day]
    );
    const row = rows[0];
    if (row === undefined) return zeroUsage(day);
    return {
      day: row.day,
      llmCalls: row.llm_calls,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      microUsd: row.micro_usd,
    };
  }

  async recordCall(day: string, usage: CallUsage): Promise<DailyUsage> {
    // A single atomic upsert (not read-then-write) so two concurrent
    // `resume.yml` pollers — or a retried Action — can never race the
    // counter (SPEC §9: "duplicate/overlapping runs... two records are
    // legal, duplicate effects are not" — the budget counter is the same
    // shared-state class of problem).
    const rows = await this.sql.query<BudgetRow>(
      `insert into dogwatch_budget (day, llm_calls, input_tokens, output_tokens, micro_usd)
       values ($1, 1, $2, $3, $4)
       on conflict (day) do update set
         llm_calls = dogwatch_budget.llm_calls + 1,
         input_tokens = dogwatch_budget.input_tokens + excluded.input_tokens,
         output_tokens = dogwatch_budget.output_tokens + excluded.output_tokens,
         micro_usd = dogwatch_budget.micro_usd + excluded.micro_usd
       returning day::text, llm_calls, input_tokens, output_tokens, micro_usd`,
      [day, usage.inputTokens, usage.outputTokens, usage.microUsd]
    );
    const row = rows[0];
    if (row === undefined) throw new Error(`PostgresBudgetStore.recordCall: upsert into dogwatch_budget returned no row for day ${day}`);
    return {
      day: row.day,
      llmCalls: row.llm_calls,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      microUsd: row.micro_usd,
    };
  }
}

export interface CreateBudgetStoreOptions {
  /** Presence alone is the activation signal (SPEC §8's own phrasing: "in-
   * memory default, documented Neon implementation activating on
   * DATABASE_URL"). Undefined/empty ⇒ in-memory. */
  databaseUrl?: string;
  /** The M4 seam: until a real Postgres/Neon connection is wired into the
   * CLI, `databaseUrl` alone is not enough to activate — see the thrown
   * error below for why silently degrading to in-memory here would be
   * dishonest about durability. */
  sqlExecutor?: SqlExecutor;
}

export function createBudgetStore(opts?: CreateBudgetStoreOptions): BudgetStore {
  if (opts?.databaseUrl === undefined || opts.databaseUrl.length === 0) {
    return new InMemoryBudgetStore();
  }
  if (opts.sqlExecutor === undefined) {
    throw new Error(
      "DATABASE_URL is set but no Postgres executor is wired yet (Neon connection lands at M4, " +
        "SPEC §12) — refusing to silently fall back to an in-memory budget store that would not " +
        "survive across runs and would defeat the whole point of the daily ceiling."
    );
  }
  return new PostgresBudgetStore(opts.sqlExecutor);
}
