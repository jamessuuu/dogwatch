/**
 * Drizzle schema for dogwatch's OWN Postgres table (SPEC §3): exactly one —
 * `dogwatch_budget` — everything else Neon holds is sluice's own four
 * tables, created by `@jamessuuu/sluice-store-postgres`'s own migrations,
 * not this file's concern (SPEC §1 non-goal 4: no sluice reimplementation,
 * which extends to not re-declaring sluice's schema here).
 *
 * `day` is a real `date` column (not the `bigint` epoch-ms convention
 * sluice's own schema uses for timestamps) because this table's PK is a
 * UTC calendar day bucket (`llm/budget.ts`'s `dayBucket()`), a genuinely
 * different kind of value than an instant in time — `date` is what SQL has
 * for that, and there is no VirtualClock disagreement risk here the way
 * sluice's schema.ts warns about, since this table is never touched by
 * sluice's own store methods.
 *
 * `decide_attempts` (M5 SPEC §6): the `/api/gate/decide` WAF-adjacent
 * app-level counter, incremented on every decide attempt regardless of
 * outcome, checked before any model call and before honoring the route's
 * 200/day cap.
 */
import { bigint, date, integer, pgTable } from "drizzle-orm/pg-core";

export const dogwatchBudget = pgTable("dogwatch_budget", {
  day: date("day", { mode: "string" }).primaryKey(),
  llmCalls: integer("llm_calls").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  microUsd: bigint("micro_usd", { mode: "number" }).notNull().default(0),
  decideAttempts: integer("decide_attempts").notNull().default(0),
});
