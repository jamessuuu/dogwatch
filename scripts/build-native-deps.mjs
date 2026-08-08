#!/usr/bin/env node
/**
 * `apps/web` consumes `packages/dogwatch` and `@jamessuuu/sluice` as
 * COMPILED output, not their raw TypeScript source — both packages' own
 * `exports` field points at `./src/index.ts` (NodeNext resolution, for
 * their own `tsc` builds; neither is published, SPEC §4), and the site's
 * bundler cannot transpile that source directly across a package boundary
 * (verified against Next 16.3's Turbopack and webpack alike). See
 * `apps/web/next.config.ts` and `apps/web/lib/data.ts` for where the
 * compiled output actually gets imported.
 *
 * This script builds both — a small, portable Node wrapper instead of a
 * shell one-liner so it runs identically on the Windows dev machine and
 * Linux CI. Run before `next build`/`next dev`/`next start` (apps/web's
 * own `package.json` scripts call this first).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sluiceTsconfig = resolve(repoRoot, "..", "sluice", "packages", "sluice", "tsconfig.build.json");
const dogwatchTsconfig = join(repoRoot, "packages", "dogwatch", "tsconfig.build.json");
// The `tsc` JS entry point directly (not the `.CMD`/shell wrapper in
// `.bin/`) — runnable via `node`, identically on Windows and POSIX, no
// shell involved.
const tscEntry = join(repoRoot, "node_modules", "typescript", "bin", "tsc");

function build(label, tsconfigPath) {
  if (!existsSync(tsconfigPath)) {
    console.error(`build-native-deps: ${label} tsconfig not found at ${tsconfigPath}`);
    process.exit(1);
  }
  console.log(`build-native-deps: building ${label} (${tsconfigPath})`);
  const result = spawnSync(process.execPath, [tscEntry, "-p", tsconfigPath], { stdio: "inherit" });
  if (result.error !== undefined) {
    console.error(`build-native-deps: ${label} build failed to spawn:`, result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`build-native-deps: ${label} build failed (exit ${String(result.status)})`);
    process.exit(result.status ?? 1);
  }
}

build("@jamessuuu/sluice", sluiceTsconfig);
build("dogwatch", dogwatchTsconfig);
