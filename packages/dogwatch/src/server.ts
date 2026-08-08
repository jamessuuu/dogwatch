/**
 * Server-only surface for `apps/web`'s ONE route handler (SPEC §6 M5,
 * `/api/gate/decide`) — deliberately separate from `src/index.ts` (which
 * must stay browser-safe for the Verify button bundle). Node-only: pulls in
 * `pg`/Drizzle/`src/effects` freely. Consumed the same way `lib/data.ts`
 * already consumes `dist/index.js` — a relative import to this file's
 * compiled output, never the bare `dogwatch` package specifier.
 */
export { decideGate, type DecideInput } from "./effects/decide.js";
export { decisionChannelOf } from "./effects/gate-entry.js";
export { createDogwatchStore, type DogwatchStore } from "./store/index.js";
export {
  InMemoryDecideAttemptStore,
  PostgresDecideAttemptStore,
  type DecideAttemptStore,
} from "./store/decide-attempts.js";
export { createPgPoolSqlExecutor } from "./store/sql-executor.js";
export { dayBucket } from "./llm/budget.js";
export { SluiceError, createSluice, systemClock } from "@jamessuuu/sluice";
export { z } from "zod";
