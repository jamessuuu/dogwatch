// CI drift gate for README.md's own "Status: M0–M<N> landed." declaration
// (same "docs cannot silently outpace the code" principle as
// schema:check/render:check/brand:check — dogwatch cannot tolerate in its
// own README the exact "documentation the code falsifies" pattern its own
// honesty rubric exists to catch in published records). Fails when the
// newest `feat(mN)` milestone commit is ahead of (or behind) the milestone
// the README's Status block declares landed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const readmePath = fileURLToPath(new URL("../README.md", import.meta.url));

// Every landed-milestone commit reachable from HEAD, e.g. subject line
// "feat(m5): the gate kernel ...". `--format=%s` restricts the grep to the
// commit SUBJECT only, so a body mentioning "feat(mN)" in passing (this
// very script's own commit, for instance) can never count.
const log = execFileSync("git", ["log", "--format=%s"], { cwd: repoRoot, encoding: "utf8" });
const landedMilestones = [...log.matchAll(/^feat\(m(\d+)\):/gim)].map((m) => Number(m[1]));
if (landedMilestones.length === 0) {
  console.error("readme-check: no feat(mN) commit found in git history — nothing to check the README against.");
  process.exit(1);
}
const newestLandedMilestone = Math.max(...landedMilestones);

const readme = readFileSync(readmePath, "utf8");
const statusMatch = /Status:\s*M0[–-]M(\d+)\s+landed/i.exec(readme);
if (statusMatch === null) {
  console.error(
    'readme-check: could not find a "Status: M0–M<N> landed." declaration in README.md\'s Status block ' +
      "— update this script's pattern to match the new wording, or restore the declaration."
  );
  process.exit(1);
}
const declaredMilestone = Number(statusMatch[1]);

if (declaredMilestone < newestLandedMilestone) {
  console.error(
    `readme-check: README.md declares "M0–M${String(declaredMilestone)} landed" but the newest feat(mN) commit is ` +
      `M${String(newestLandedMilestone)} ("${log.split("\n").find((l) => new RegExp(`^feat\\(m${String(newestLandedMilestone)}\\):`, "i").test(l))}"). ` +
      "The README is behind the code — bring its Status block current."
  );
  process.exit(1);
}
if (declaredMilestone > newestLandedMilestone) {
  console.error(
    `readme-check: README.md declares "M0–M${String(declaredMilestone)} landed" but the newest feat(mN) commit is only ` +
      `M${String(newestLandedMilestone)} — the README claims a milestone that hasn't landed yet.`
  );
  process.exit(1);
}
console.log(`readme-check: README.md's declared milestone (M${String(declaredMilestone)}) matches the newest feat(mN) commit.`);
