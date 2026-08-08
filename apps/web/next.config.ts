import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = dirname(fileURLToPath(import.meta.url));

// `@jamessuuu/sluice` is an unpublished, workspace-linked, zero-dependency
// package whose `exports` field points at raw TypeScript source (NodeNext
// resolution — SPEC's own sequencing note: M0-M3 build against sluice pre-
// 1.0.0-rc.1). `dogwatch`'s own build output (imported by `apps/web` via a
// relative path to `packages/dogwatch/dist`, not the bare specifier — see
// `lib/data.ts`) re-exports two of sluice's pure functions (`verifyEvents`,
// plus `canonicalJson`/`sha256Hex` transitively through `record/hash.js`)
// for the browser Verify button, and those compiled files still reference
// sluice by its bare package name. Alias it straight to sluice's own build
// output (`tsc -p tsconfig.build.json`, which `ci.yml` runs before this app
// builds) instead of asking the bundler to transpile sluice's source.
//
// This project builds with classic webpack (`next build --webpack` / `next
// start` — see package.json), not Turbopack: Turbopack's Windows resolver
// currently rejects an OS-absolute alias target ("windows imports are not
// implemented yet") and a relative one silently fails to resolve, on this
// exact scenario (verified against Next 16.3.0). Webpack's `resolve.alias`
// takes the same absolute path correctly.
const SLUICE_DIST = resolve(here, "..", "..", "..", "sluice", "packages", "sluice", "dist", "index.js");
// M5: /api/gate/decide (via dogwatch's server.ts) pulls in
// @jamessuuu/sluice-store-postgres — same unpublished-package,
// exports-points-at-raw-TS-source story as SLUICE_DIST above.
const SLUICE_STORE_POSTGRES_DIST = resolve(
  here,
  "..",
  "..",
  "..",
  "sluice",
  "packages",
  "sluice-store-postgres",
  "dist",
  "index.js"
);

// Next's own `NextConfig["webpack"]` type is `any` (see `next/dist/server/
// config-shared.d.ts`) — this local type stands in so the function body
// isn't riddled with `no-unsafe-*` lint errors from unchecked `any` access.
interface MinimalWebpackConfig {
  resolve: { alias?: Record<string, string> };
}

const nextConfig: NextConfig = {
  // SPEC §10/D3: every page is static (no route handler exists in this
  // product except the M5 /api/gate/decide, not shipped yet), so Vercel
  // serves the whole site from the CDN with zero functions in the request
  // path — "render with every function paused" stays true by construction.
  // `next/image`'s optimizer IS a function; unoptimized keeps that promise
  // even if a future page reaches for it.
  images: { unoptimized: true },
  webpack(config: MinimalWebpackConfig) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@jamessuuu/sluice": SLUICE_DIST,
      "@jamessuuu/sluice-store-postgres": SLUICE_STORE_POSTGRES_DIST,
    };
    return config;
  },
};

export default nextConfig;
