/**
 * The `SqlExecutor` seam `llm/budget.ts`'s `PostgresBudgetStore` was written
 * against (M0-M3, ahead of any real driver being wired), now given a real
 * implementation over the SAME `pg.Pool` `store/index.ts` already opened —
 * one connection pool serves both `dogwatch_budget`'s LLM columns and (M5)
 * its `decide_attempts` column, never a second pool for the same table.
 */
import type { Pool } from "pg";
import type { SqlExecutor } from "../llm/budget.js";

export function createPgPoolSqlExecutor(pool: Pool): SqlExecutor {
  return {
    async query<T = Record<string, unknown>>(sqlText: string, params: readonly unknown[]): Promise<T[]> {
      const result = await pool.query(sqlText, params as unknown[]);
      return result.rows as T[];
    },
  };
}
