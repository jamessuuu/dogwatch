/**
 * Store verification against a REAL Postgres (SPEC §12 M4 brief: "wire a
 * postgres:17 service container in CI running the same tests"). Gated on
 * `DATABASE_URL`: CI's `postgres:17` service sets it and this package's
 * `db:migrate` runs before this suite (see `.github/workflows/ci.yml`);
 * locally, with no Docker and no network database (this machine's own
 * constraint), `DATABASE_URL` is unset and the suite reports itself
 * skipped — a visible, named skip, not silent absence (mirrors
 * `sluice-store-postgres/src/store.real.test.ts` exactly).
 */
import { createSluice } from "@jamessuuu/sluice";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, describe, expect, test } from "vitest";
import { dogwatchStoreFromDb } from "./index.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(databaseUrl === undefined || databaseUrl.length === 0)(
  "dogwatch store (real Postgres via DATABASE_URL)",
  () => {
    const pool = new Pool({ connectionString: databaseUrl });

    afterAll(async () => {
      await pool.end();
    });

    test("dogwatch_budget exists (migrated by the CI step) and round-trips a row", async () => {
      const db = drizzle(pool);
      const day = "2026-08-09";
      await db.execute(sql`delete from dogwatch_budget where day = ${day}`);
      await db.execute(sql`
        insert into dogwatch_budget (day, llm_calls, input_tokens, output_tokens, micro_usd, decide_attempts)
        values (${day}, 3, 900, 300, 4500, 2);
      `);
      const rows = await db.execute<{ llm_calls: number }>(
        sql`select llm_calls from dogwatch_budget where day = ${day}`
      );
      const row = (rows as unknown as { rows: { llm_calls: number }[] }).rows[0];
      expect(row?.llm_calls).toBe(3);
    });

    test("a real cross-run chain anchors correctly against the live database", async () => {
      const db = drizzle(pool);
      await pool.query(`TRUNCATE sluice_effect, sluice_gate, sluice_event, sluice_cursor, sluice_circuit`);
      const dogwatchStore = dogwatchStoreFromDb(db);
      const sluice = createSluice({ store: dogwatchStore.store, namespace: "real-pg-test", owner: "test" });
      await sluice.run({ key: "k1" }, () => Promise.resolve({ ok: true }));
      await sluice.run({ key: "k2" }, () => Promise.resolve({ ok: true }));
      const verified = await sluice.audit.verify("real-pg-test");
      expect(verified.ok).toBe(true);
      const events = await sluice.audit.since({ namespace: "real-pg-test", seq: 0 }, 100);
      expect(events).toHaveLength(4); // claimed+succeeded, twice
    });
  }
);

if (databaseUrl === undefined || databaseUrl.length === 0) {
  test.skip("real-postgres store tests skipped: DATABASE_URL not set (no Docker/network DB locally — CI's postgres:17 service sets this)", () => {
    // Intentionally empty — a visible, named skip marker (mirrors
    // sluice-store-postgres/src/store.real.test.ts).
  });
}
