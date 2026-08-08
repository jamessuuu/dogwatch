/**
 * Store-backed verification (SPEC §12 M4 brief): "Docker is NOT available on
 * this machine — sluice hit the same wall — use @electric-sql/pglite
 * locally for the full store-backed test suite, AND wire a postgres:17
 * service container in CI running the same tests. Mirror exactly what
 * sluice-store-postgres did."
 *
 * This file mirrors `sluice-store-postgres/src/store.conformance.test.ts`'s
 * shape: an in-memory pglite instance (real Postgres compiled to WASM, not a
 * mock), migrated from the EXACT checked-in migration SQL — both
 * `@jamessuuu/sluice-store-postgres`'s own migrations (its four tables) and
 * dogwatch's own (`dogwatch_budget`) — proving the migration files
 * themselves are correct, not just the schema.ts they were generated from.
 * `store.real.test.ts` runs the same shape of assertions against a real
 * `postgres:17` service container in CI, gated on `DATABASE_URL`.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dogwatchStoreFromDb } from "./index.js";

const OWN_MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");
const SLUICE_STORE_POSTGRES_MIGRATIONS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "node_modules",
  "@jamessuuu",
  "sluice-store-postgres",
  "migrations"
);

let client: PGlite;

async function freshDb(): Promise<PgliteDatabase> {
  client = new PGlite();
  const db = drizzle(client);
  // Both migration sets, same order `scripts/migrate.ts` applies in
  // production: sluice's own tables first, then dogwatch's one addition.
  await migrate(db, { migrationsFolder: SLUICE_STORE_POSTGRES_MIGRATIONS });
  await migrate(db, { migrationsFolder: OWN_MIGRATIONS });
  return db;
}

afterEach(async () => {
  await client.close();
});

describe("dogwatch_budget (pglite, real Postgres compiled to WASM)", () => {
  it("the checked-in migration creates a table with the exact SPEC §3 column set", async () => {
    const db = await freshDb();
    const rows = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns where table_name = 'dogwatch_budget' order by column_name;
    `);
    const columns = (rows as unknown as { rows: { column_name: string }[] }).rows.map((r) => r.column_name).sort();
    expect(columns).toEqual(
      ["day", "decide_attempts", "input_tokens", "llm_calls", "micro_usd", "output_tokens"].sort()
    );
  });

  it("upserts and increments exactly like llm/budget.ts's PostgresBudgetStore SQL expects", async () => {
    const db = await freshDb();
    const day = "2026-08-09";
    await db.execute(sql`
      insert into dogwatch_budget (day, llm_calls, input_tokens, output_tokens, micro_usd)
      values (${day}, 1, 100, 50, 1000)
      on conflict (day) do update set
        llm_calls = dogwatch_budget.llm_calls + 1,
        input_tokens = dogwatch_budget.input_tokens + excluded.input_tokens,
        output_tokens = dogwatch_budget.output_tokens + excluded.output_tokens,
        micro_usd = dogwatch_budget.micro_usd + excluded.micro_usd;
    `);
    await db.execute(sql`
      insert into dogwatch_budget (day, llm_calls, input_tokens, output_tokens, micro_usd)
      values (${day}, 1, 100, 50, 1000)
      on conflict (day) do update set
        llm_calls = dogwatch_budget.llm_calls + 1,
        input_tokens = dogwatch_budget.input_tokens + excluded.input_tokens,
        output_tokens = dogwatch_budget.output_tokens + excluded.output_tokens,
        micro_usd = dogwatch_budget.micro_usd + excluded.micro_usd;
    `);
    const rows = await db.execute<{
      llm_calls: number;
      input_tokens: number;
      output_tokens: number;
      micro_usd: number;
    }>(sql`select llm_calls, input_tokens, output_tokens, micro_usd from dogwatch_budget where day = ${day};`);
    const row = (rows as unknown as { rows: { llm_calls: number; input_tokens: number; output_tokens: number; micro_usd: number }[] }).rows[0];
    expect(row).toEqual({ llm_calls: 2, input_tokens: 200, output_tokens: 100, micro_usd: 2000 });
  });

  it("decide_attempts (M5) increments independently of the llm_* columns", async () => {
    const db = await freshDb();
    const day = "2026-08-09";
    await db.execute(sql`insert into dogwatch_budget (day, decide_attempts) values (${day}, 1)`);
    await db.execute(sql`update dogwatch_budget set decide_attempts = decide_attempts + 1 where day = ${day}`);
    const rows = await db.execute<{ decide_attempts: number; llm_calls: number }>(
      sql`select decide_attempts, llm_calls from dogwatch_budget where day = ${day};`
    );
    const row = (rows as unknown as { rows: { decide_attempts: number; llm_calls: number }[] }).rows[0];
    expect(row).toEqual({ decide_attempts: 2, llm_calls: 0 });
  });
});

describe("dogwatchStoreFromDb + sluice wiring (pglite)", () => {
  it("createSluice against the real Postgres-shaped store performs a real effect + audit event", async () => {
    const { createSluice } = await import("@jamessuuu/sluice");
    const db = await freshDb();
    const dogwatchStore = dogwatchStoreFromDb(db);
    expect(dogwatchStore.kind).toBe("postgres");

    const sluice = createSluice({ store: dogwatchStore.store, namespace: "test", owner: "test-owner" });
    const outcome = await sluice.run({ key: "k1" }, () => Promise.resolve({ ok: true }));
    expect(outcome.status).toBe("executed");

    const events = await sluice.audit.since({ namespace: "test", seq: 0 }, 100);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.prevHash).toBeNull();

    const verified = await sluice.audit.verify("test");
    expect(verified.ok).toBe(true);
  });
});
