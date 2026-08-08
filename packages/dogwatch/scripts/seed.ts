/**
 * db:seed (SPEC §3): write one representative row into `dogwatch_budget` so
 * a reviewer who just ran `db:migrate` can immediately see a working
 * instance. Targets the same `DATABASE_URL` / local-pglite choice as
 * migrate.ts (mirrors `sluice-store-postgres/scripts/seed.ts`). Run
 * `db:migrate` first — this script does not create tables.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { AnyPgDatabase } from "../src/store/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

async function getDb(): Promise<{ db: AnyPgDatabase; label: string; close: () => Promise<void> }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl !== undefined && databaseUrl.length > 0) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: databaseUrl });
    return { db: drizzle(pool) as unknown as AnyPgDatabase, label: "DATABASE_URL", close: () => pool.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dataDir = path.join(here, "..", ".pglite-data");
  const client = new PGlite(dataDir);
  return {
    db: drizzle(client) as unknown as AnyPgDatabase,
    label: `local pglite (${dataDir})`,
    close: () => client.close(),
  };
}

async function main(): Promise<void> {
  const { db, label, close } = await getDb();
  try {
    const today = new Date().toISOString().slice(0, 10);
    await db.execute(sql`
      insert into dogwatch_budget (day, llm_calls, input_tokens, output_tokens, micro_usd, decide_attempts)
      values (${today}, 0, 0, 0, 0, 0)
      on conflict (day) do nothing;
    `);
    console.log(`dogwatch db:seed: seeded ${label} — one dogwatch_budget row for ${today}.`);
  } finally {
    await close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
