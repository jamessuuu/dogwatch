// CI drift gate for the gate-flow diagram — same "a generated artifact that
// no longer matches its source is exactly the rot this project exists to
// catch in OTHER repos" principle as brand-check.mjs/schema:check/
// render:check. Regenerates scripts/diagram.mjs's output into a temp file
// and diffs it byte-for-byte against the committed SVG.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const committedPath = join(repoRoot, "apps", "web", "public", "diagram", "gate-flow.svg");
const tmp = mkdtempSync(join(tmpdir(), "dogwatch-diagram-"));
const freshPath = join(tmp, "gate-flow.svg");

try {
  execFileSync(process.execPath, [join(repoRoot, "scripts", "diagram.mjs"), `--out=${freshPath}`], { stdio: "pipe" });

  const committed = readFileSync(committedPath, "utf8");
  const fresh = readFileSync(freshPath, "utf8");

  if (committed !== fresh) {
    console.error(
      "diagram-check: apps/web/public/diagram/gate-flow.svg is out of date with scripts/diagram.mjs. Run \"pnpm diagram\"."
    );
    process.exit(1);
  }
  console.log("apps/web/public/diagram/gate-flow.svg is up to date with scripts/diagram.mjs.");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
