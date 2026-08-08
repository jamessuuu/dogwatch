/**
 * `dogwatch_budget.decide_attempts` (SPEC §6): the app-level counter behind
 * `/api/gate/decide`, checked before honoring the route's 200/day cap —
 * incremented on EVERY decide attempt regardless of outcome (a rejected or
 * bad-token attempt still counts, since the counter's job is bounding
 * REQUEST volume, not successful decisions). Same table, same upsert shape
 * as `llm/budget.ts`'s `PostgresBudgetStore`/`InMemoryBudgetStore` — a
 * sibling module rather than folded into that one, since the two counters
 * are read/written from different processes (`dogwatch watch`'s CLI
 * process vs. the API route's serverless function) and have no shared
 * caller that would benefit from one interface.
 */
import type { SqlExecutor } from "../llm/budget.js";

export interface DecideAttemptStore {
  /** Zero if nothing has been recorded for `day` yet. */
  getAttempts(day: string): Promise<number>;
  /** Atomically increment and return the new total. */
  recordAttempt(day: string): Promise<number>;
}

export class InMemoryDecideAttemptStore implements DecideAttemptStore {
  private readonly byDay = new Map<string, number>();

  // eslint-disable-next-line @typescript-eslint/require-await -- interface parity with the Postgres implementation
  async getAttempts(day: string): Promise<number> {
    return this.byDay.get(day) ?? 0;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- interface parity with the Postgres implementation
  async recordAttempt(day: string): Promise<number> {
    const next = (this.byDay.get(day) ?? 0) + 1;
    this.byDay.set(day, next);
    return next;
  }
}

interface DecideAttemptRow {
  decide_attempts: number;
}

export class PostgresDecideAttemptStore implements DecideAttemptStore {
  constructor(private readonly sql: SqlExecutor) {}

  async getAttempts(day: string): Promise<number> {
    const rows = await this.sql.query<DecideAttemptRow>(`select decide_attempts from dogwatch_budget where day = $1`, [day]);
    return rows[0]?.decide_attempts ?? 0;
  }

  async recordAttempt(day: string): Promise<number> {
    const rows = await this.sql.query<DecideAttemptRow>(
      `insert into dogwatch_budget (day, decide_attempts)
       values ($1, 1)
       on conflict (day) do update set decide_attempts = dogwatch_budget.decide_attempts + 1
       returning decide_attempts`,
      [day]
    );
    const row = rows[0];
    if (row === undefined) throw new Error(`PostgresDecideAttemptStore.recordAttempt: upsert returned no row for day ${day}`);
    return row.decide_attempts;
  }
}
