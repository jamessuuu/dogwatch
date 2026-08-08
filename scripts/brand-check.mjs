// CI drift gate for brand assets (BRAND-KIT.md: "Deterministic — verified
// byte-identical across runs, so CI can regenerate and fail on drift.").
// Regenerates scripts/brand.mjs's output into a temp dir and diffs every
// file byte-for-byte against the committed apps/web/public/brand/.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const committedDir = join(repoRoot, "apps", "web", "public", "brand");
const tmp = mkdtempSync(join(tmpdir(), "dogwatch-brand-"));

try {
  execFileSync(process.execPath, [join(repoRoot, "scripts", "brand.mjs"), "--project=dogwatch", `--out=${tmp}`], {
    stdio: "pipe",
  });

  const committedFiles = readdirSync(committedDir).sort();
  const freshFiles = readdirSync(tmp).sort();

  let drifted = false;
  if (committedFiles.join(",") !== freshFiles.join(",")) {
    console.error(`brand-check: file set drifted.\n  committed: ${committedFiles.join(", ")}\n  fresh:     ${freshFiles.join(", ")}`);
    drifted = true;
  }
  for (const file of freshFiles) {
    if (!committedFiles.includes(file)) continue;
    const committed = readFileSync(join(committedDir, file), "utf8");
    const fresh = readFileSync(join(tmp, file), "utf8");
    if (committed !== fresh) {
      console.error(`brand-check: apps/web/public/brand/${file} is out of date with scripts/brand.mjs. Run "pnpm brand".`);
      drifted = true;
    }
  }

  if (drifted) {
    process.exit(1);
  }
  console.log("apps/web/public/brand is up to date with scripts/brand.mjs.");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
