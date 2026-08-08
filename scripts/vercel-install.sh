#!/usr/bin/env bash
# TEMPORARY until @jamessuuu/sluice is published to npm.
#
# dogwatch consumes sluice through `link:../../../sluice/packages/sluice`,
# a sibling checkout on the maintainer's machine. That path does not exist on
# a build runner, and a git dependency does not help either: sluice's
# `exports` point at TypeScript source in development and only swap to `dist/`
# via `publishConfig` at npm-publish time, so a git install resolves to files
# that are neither shipped nor loadable.
#
# So: clone sluice next to this checkout, build it, and let the existing link
# resolve exactly as it does locally. When sluice is on npm this file is
# deleted and the dependency becomes a version pin — see README.
set -euo pipefail

SLUICE_REF="${SLUICE_REF:-main}"
SIBLING="$(cd .. && pwd)/sluice"

if [ ! -d "$SIBLING" ]; then
  echo "vercel-install: cloning sluice@${SLUICE_REF} to ${SIBLING}"
  git clone --depth 1 --branch "$SLUICE_REF" https://github.com/jamessuuu/sluice.git "$SIBLING"
fi

echo "vercel-install: building sluice"
( cd "$SIBLING" && pnpm install --frozen-lockfile && pnpm --filter '@jamessuuu/sluice' --filter '@jamessuuu/sluice-store-postgres' build )

echo "vercel-install: installing dogwatch"
pnpm install --no-frozen-lockfile
