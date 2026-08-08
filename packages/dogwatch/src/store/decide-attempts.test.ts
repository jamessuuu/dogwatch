import { describe, expect, it } from "vitest";
import { InMemoryDecideAttemptStore, PostgresDecideAttemptStore } from "./decide-attempts.js";
import type { SqlExecutor } from "../llm/budget.js";

describe("InMemoryDecideAttemptStore", () => {
  it("starts at zero and accumulates across calls on the same day", async () => {
    const store = new InMemoryDecideAttemptStore();
    expect(await store.getAttempts("2026-08-09")).toBe(0);
    expect(await store.recordAttempt("2026-08-09")).toBe(1);
    expect(await store.recordAttempt("2026-08-09")).toBe(2);
    expect(await store.getAttempts("2026-08-09")).toBe(2);
  });

  it("keeps separate days isolated", async () => {
    const store = new InMemoryDecideAttemptStore();
    await store.recordAttempt("2026-08-09");
    expect(await store.getAttempts("2026-08-10")).toBe(0);
  });
});

describe("PostgresDecideAttemptStore (fake SqlExecutor — no live DB)", () => {
  function fakeSql(): { executor: SqlExecutor; calls: { sql: string }[] } {
    const calls: { sql: string }[] = [];
    const rows = new Map<string, number>();
    return {
      calls,
      executor: {
        // eslint-disable-next-line @typescript-eslint/require-await -- fake, synchronous in spirit
        async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[]): Promise<T[]> {
          calls.push({ sql });
          const day = params[0] as string;
          if (sql.startsWith("select")) {
            const n = rows.get(day);
            return (n === undefined ? [] : [{ decide_attempts: n }]) as T[];
          }
          const next = (rows.get(day) ?? 0) + 1;
          rows.set(day, next);
          return [{ decide_attempts: next }] as T[];
        },
      },
    };
  }

  it("getAttempts returns 0 for a day with no row yet", async () => {
    const { executor } = fakeSql();
    const store = new PostgresDecideAttemptStore(executor);
    expect(await store.getAttempts("2026-08-09")).toBe(0);
  });

  it("recordAttempt upserts and increments atomically (one query per call)", async () => {
    const { executor, calls } = fakeSql();
    const store = new PostgresDecideAttemptStore(executor);
    await store.recordAttempt("2026-08-09");
    const after = await store.recordAttempt("2026-08-09");
    expect(after).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.sql).toContain("on conflict (day) do update");
  });
});
