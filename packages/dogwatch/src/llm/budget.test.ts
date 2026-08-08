import { describe, expect, it } from "vitest";
import {
  createBudgetStore,
  DEFAULT_BUDGET_CAPS,
  dayBucket,
  InMemoryBudgetStore,
  isBudgetExceeded,
  PostgresBudgetStore,
  type SqlExecutor,
} from "./budget.js";

describe("dayBucket", () => {
  it("buckets by UTC calendar day", () => {
    expect(dayBucket(Date.parse("2026-08-08T23:59:59.000Z"))).toBe("2026-08-08");
    expect(dayBucket(Date.parse("2026-08-09T00:00:00.000Z"))).toBe("2026-08-09");
  });
});

describe("InMemoryBudgetStore", () => {
  it("starts at zero for a day with no recorded calls", async () => {
    const store = new InMemoryBudgetStore();
    const usage = await store.getUsage("2026-08-08");
    expect(usage).toEqual({ day: "2026-08-08", llmCalls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0 });
  });

  it("accumulates across calls on the same day", async () => {
    const store = new InMemoryBudgetStore();
    await store.recordCall("2026-08-08", { inputTokens: 100, outputTokens: 50, microUsd: 1000 });
    const usage = await store.recordCall("2026-08-08", { inputTokens: 200, outputTokens: 25, microUsd: 500 });
    expect(usage).toEqual({ day: "2026-08-08", llmCalls: 2, inputTokens: 300, outputTokens: 75, microUsd: 1500 });
  });

  it("keeps separate days isolated", async () => {
    const store = new InMemoryBudgetStore();
    await store.recordCall("2026-08-08", { inputTokens: 100, outputTokens: 50, microUsd: 1000 });
    const otherDay = await store.getUsage("2026-08-09");
    expect(otherDay.llmCalls).toBe(0);
  });
});

describe("isBudgetExceeded", () => {
  const base = { day: "2026-08-08", llmCalls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0 };

  it("is false when every counter is under its cap", () => {
    expect(isBudgetExceeded({ ...base, llmCalls: 19 }, DEFAULT_BUDGET_CAPS)).toBe(false);
  });

  it("trips on the calls cap", () => {
    expect(isBudgetExceeded({ ...base, llmCalls: 20 }, DEFAULT_BUDGET_CAPS)).toBe(true);
  });

  it("trips on the input-token cap", () => {
    expect(isBudgetExceeded({ ...base, inputTokens: 100_000 }, DEFAULT_BUDGET_CAPS)).toBe(true);
  });

  it("trips on the output-token cap", () => {
    expect(isBudgetExceeded({ ...base, outputTokens: 20_000 }, DEFAULT_BUDGET_CAPS)).toBe(true);
  });

  it("trips on the micro-USD cap ($0.20)", () => {
    expect(isBudgetExceeded({ ...base, microUsd: 200_000 }, DEFAULT_BUDGET_CAPS)).toBe(true);
  });
});

describe("createBudgetStore", () => {
  it("returns InMemoryBudgetStore when no databaseUrl is given", () => {
    expect(createBudgetStore()).toBeInstanceOf(InMemoryBudgetStore);
    expect(createBudgetStore({})).toBeInstanceOf(InMemoryBudgetStore);
    expect(createBudgetStore({ databaseUrl: "" })).toBeInstanceOf(InMemoryBudgetStore);
  });

  it("refuses to silently downgrade a configured DATABASE_URL with no executor", () => {
    expect(() => createBudgetStore({ databaseUrl: "postgres://example" })).toThrow(/M4/);
  });

  it("activates PostgresBudgetStore given both databaseUrl and a sqlExecutor", () => {
    const fakeSql: SqlExecutor = {
      // eslint-disable-next-line @typescript-eslint/require-await -- fake, no live DB
      async query() {
        return [];
      },
    };
    const store = createBudgetStore({ databaseUrl: "postgres://example", sqlExecutor: fakeSql });
    expect(store).toBeInstanceOf(PostgresBudgetStore);
  });
});

describe("PostgresBudgetStore (fake SqlExecutor — no live DB)", () => {
  function fakeSql(): { executor: SqlExecutor; calls: { sql: string; params: readonly unknown[] }[] } {
    const calls: { sql: string; params: readonly unknown[] }[] = [];
    const rows = new Map<string, { day: string; llm_calls: number; input_tokens: number; output_tokens: number; micro_usd: number }>();
    return {
      calls,
      executor: {
        // eslint-disable-next-line @typescript-eslint/require-await -- fake, synchronous in spirit
        async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[]): Promise<T[]> {
          calls.push({ sql, params });
          const day = params[0] as string;
          if (sql.startsWith("select")) {
            const row = rows.get(day);
            return (row === undefined ? [] : [row]) as T[];
          }
          const prev = rows.get(day) ?? { day, llm_calls: 0, input_tokens: 0, output_tokens: 0, micro_usd: 0 };
          const next = {
            day,
            llm_calls: prev.llm_calls + 1,
            input_tokens: prev.input_tokens + (params[1] as number),
            output_tokens: prev.output_tokens + (params[2] as number),
            micro_usd: prev.micro_usd + (params[3] as number),
          };
          rows.set(day, next);
          return [next] as T[];
        },
      },
    };
  }

  it("getUsage returns zeros for a day with no row yet", async () => {
    const { executor } = fakeSql();
    const store = new PostgresBudgetStore(executor);
    expect(await store.getUsage("2026-08-08")).toEqual({ day: "2026-08-08", llmCalls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0 });
  });

  it("recordCall upserts and accumulates atomically (one query per call)", async () => {
    const { executor, calls } = fakeSql();
    const store = new PostgresBudgetStore(executor);
    await store.recordCall("2026-08-08", { inputTokens: 100, outputTokens: 50, microUsd: 1000 });
    const after = await store.recordCall("2026-08-08", { inputTokens: 200, outputTokens: 25, microUsd: 500 });
    expect(after).toEqual({ day: "2026-08-08", llmCalls: 2, inputTokens: 300, outputTokens: 75, microUsd: 1500 });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.sql).toContain("on conflict (day) do update");
  });
});
