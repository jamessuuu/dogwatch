/**
 * dogwatch's own store wiring (SPEC §3/§5/§9, M4): wraps
 * `@jamessuuu/sluice-store-postgres`'s `createPostgresStore` behind a
 * connectivity check, so a configured-but-unreachable `DATABASE_URL`
 * degrades to `MemoryStore` exactly like no `DATABASE_URL` at all — fail
 * closed, never fail silent (SPEC §9's "Neon suspended / over quota" row).
 *
 * `degradeReason` distinguishes the two memory-mode paths for the record's
 * `degraded[]` block: "no DATABASE_URL was ever configured" (the ordinary
 * M0-M3 default — ALWAYS true in every unit test, the golden-replay
 * fixtures, and any local `dogwatch watch` invocation without Neon wired
 * up) is NOT a degradation worth flagging, so it stays absent; "a
 * DATABASE_URL was configured but the connection failed" IS the real
 * failure contract SPEC §9 describes, and is flagged. This is what keeps
 * `record/build-run.ts`'s output byte-identical for every existing
 * memory-store caller (golden replay tests, unit tests, dry runs) while
 * still fully implementing the degrade-and-flag path for a real outage.
 */
import { MemoryStore, type SluiceStore } from "@jamessuuu/sluice";
import { createPostgresStore } from "@jamessuuu/sluice-store-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";

export type AnyPgDatabase = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

export type StoreKind = "postgres" | "memory";

export interface DogwatchStore {
  store: SluiceStore;
  kind: StoreKind;
  /** Present iff a `databaseUrl` was supplied but could not be reached —
   * the "Neon suspended / over quota" contract (SPEC §9). Absent for the
   * ordinary "no DATABASE_URL configured" default. */
  degradeReason?: "store_unavailable";
  /** The live `pg.Pool` iff `kind === "postgres"` — exposed so a caller
   * (`cli/watch.ts`) can build the SAME pool's `SqlExecutor` for
   * `llm/budget.ts`'s `PostgresBudgetStore` (`dogwatch_budget` is one
   * table, one pool, shared by both the LLM columns and M5's
   * `decide_attempts`) instead of opening a second connection. */
  pool?: Pool;
  close(): Promise<void>;
}

export interface CreateDogwatchStoreOptions {
  databaseUrl?: string | undefined;
  /** Test seam: skip the real `select 1` connectivity probe (pglite/a
   * caller that already knows the pool is live). Default false. */
  skipConnectivityCheck?: boolean;
}

const NOOP_CLOSE = (): Promise<void> => Promise.resolve();

export async function createDogwatchStore(opts?: CreateDogwatchStoreOptions): Promise<DogwatchStore> {
  const databaseUrl = opts?.databaseUrl;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    return { store: new MemoryStore(), kind: "memory", close: NOOP_CLOSE };
  }

  const pool = new Pool({ connectionString: databaseUrl });
  if (opts?.skipConnectivityCheck !== true) {
    try {
      await pool.query("select 1");
    } catch {
      await pool.end().catch(() => undefined);
      return {
        store: new MemoryStore(),
        kind: "memory",
        degradeReason: "store_unavailable",
        close: NOOP_CLOSE,
      };
    }
  }

  const db = drizzle(pool);
  const store = createPostgresStore(db);
  return { store, kind: "postgres", pool, close: () => pool.end() };
}

/** Build a `DogwatchStore` directly from an already-constructed Drizzle
 * database (pglite in tests, or any other Drizzle Postgres driver) — the
 * seam `store/index.test.ts` and the M4 pglite-backed integration suite use
 * instead of a real network `DATABASE_URL`. */
export function dogwatchStoreFromDb(db: AnyPgDatabase): DogwatchStore {
  return { store: createPostgresStore(db), kind: "postgres", close: NOOP_CLOSE };
}
