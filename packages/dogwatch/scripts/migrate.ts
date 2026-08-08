/**
 * db:migrate (SPEC §3/§12 M4): apply BOTH `@jamessuuu/sluice-store-postgres`'s
 * own migrations (its four tables: sluice_effect | sluice_gate | sluice_event
 * | sluice_cursor | sluice_circuit — "its migrations, not ours", SPEC §3) AND
 * dogwatch's own single additional migration (`dogwatch_budget`), against
 * the same target. Mirrors `sluice-store-postgres/scripts/migrate.ts`
 * exactly (per the M4 brief: "mirror exactly what sluice-store-postgres
 * did"): with `DATABASE_URL` set, migrate a real Postgres/Neon instance;
 * with nothing set, migrate a local pglite data directory — pglite IS
 * Postgres compiled to WASM, not a mock, so this gives a reviewer a working
 * local instance with no Docker and no network database (this machine's own
 * constraint, SPEC's M4 brief).
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const ownMigrationsFolder = path.join(here, "..", "migrations");
const sluiceStorePostgresMigrationsFolder = path.join(
  here,
  "..",
  "node_modules",
  "@jamessuuu",
  "sluice-store-postgres",
  "migrations"
);

function redact(url: string): string {
  return url.replace(/:[^:@/]*@/, ":***@");
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl !== undefined && databaseUrl.length > 0) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const db = drizzle(pool);
      console.log(`dogwatch db:migrate: migrating ${redact(databaseUrl)}`);
      console.log("dogwatch db:migrate: applying @jamessuuu/sluice-store-postgres's own migrations first...");
      await migrate(db, { migrationsFolder: sluiceStorePostgresMigrationsFolder });
      console.log("dogwatch db:migrate: applying dogwatch's own migration (dogwatch_budget)...");
      await migrate(db, { migrationsFolder: ownMigrationsFolder });
      console.log("dogwatch db:migrate: migrations applied.");
    } finally {
      await pool.end();
    }
    return;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = path.join(here, "..", ".pglite-data");
  const client = new PGlite(dataDir);
  try {
    const db = drizzle(client);
    console.log(`dogwatch db:migrate: DATABASE_URL not set — migrating local pglite instance at ${dataDir}`);
    await migrate(db, { migrationsFolder: sluiceStorePostgresMigrationsFolder });
    await migrate(db, { migrationsFolder: ownMigrationsFolder });
    console.log(
      "dogwatch db:migrate: migrations applied. Set DATABASE_URL to target a real Postgres/Neon instance instead."
    );
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
