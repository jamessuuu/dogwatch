/**
 * drizzle-kit config for dogwatch's OWN migration (`dogwatch_budget` only —
 * SPEC §3). `pnpm --filter dogwatch db:generate` after any schema change;
 * never hand-edit a checked-in migration file (forward-only additive
 * policy, mirrored from `@jamessuuu/sluice-store-postgres`'s own config).
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/store/schema.ts",
  out: "./migrations",
});
