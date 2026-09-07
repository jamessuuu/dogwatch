/**
 * Prove the checkers can FAIL before believing they pass.
 *
 * A checker that silently matches nothing reports "no drift", which is
 * indistinguishable from a clean pass. dogwatch applies that discipline to
 * its targets; this applies it to dogwatch's own tooling and to the new
 * build-time history aggregation, whose "24/24 hash links verified" claim
 * on the landing page is worthless if the check cannot go red.
 *
 * Every mutation is made to a COPY under a temp dir, or reverted in a
 * finally block. Nothing here can leave the repo dirty.
 *
 *   node scripts/falsify.mjs
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const results = [];

function record(name, sawFailure, detail) {
  results.push({ name, ok: sawFailure, detail });
  console.log(`${sawFailure ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}

/** Run a pnpm script; return true if it EXITED NON-ZERO (i.e. caught the plant). */
function scriptFails(script) {
  try {
    execFileSync("pnpm", ["run", script], { cwd: repoRoot, stdio: "pipe", shell: true });
    return false;
  } catch {
    return true;
  }
}

/** Temporarily corrupt a file, run fn, always restore. */
function withCorruption(relPath, mutate, fn) {
  const abs = join(repoRoot, relPath);
  const backup = `${abs}.falsify-backup`;
  copyFileSync(abs, backup);
  try {
    const original = readFileSync(abs, "utf8");
    const corrupted = mutate(original);
    if (corrupted === original) throw new Error(`falsify: mutation of ${relPath} changed nothing — the plant itself is broken`);
    writeFileSync(abs, corrupted);
    return fn();
  } finally {
    copyFileSync(backup, abs);
    execFileSync("node", ["-e", `require("node:fs").unlinkSync(${JSON.stringify(backup)})`], { cwd: repoRoot });
  }
}

// ---- 1. the cross-run hash chain the landing page claims to verify -------
{
  const idxPath = join(repoRoot, "runs", "index.json");
  const idx = JSON.parse(readFileSync(idxPath, "utf8"));
  // Rebuild the same check loadHistory() runs, against tampered data.
  const hashes = idx.runs.map((r) => r.recordHash);
  const prevs = idx.runs.map((r) => {
    const rec = JSON.parse(readFileSync(join(repoRoot, r.path), "utf8"));
    return rec.chain.prevRecordHash;
  });
  const linksOf = (hs) => {
    let n = 0;
    for (let i = 1; i < hs.length; i += 1) if (prevs[i] === hs[i - 1]) n += 1;
    return n;
  };
  const clean = linksOf(hashes);
  const tampered = [...hashes];
  tampered[10] = "0".repeat(64);
  const broken = linksOf(tampered);
  record(
    "chain check detects a tampered recordHash",
    broken < clean,
    `clean ${String(clean)} links, tampered ${String(broken)} links`,
  );
}

// ---- 2. render:check (runs/index.json drift) -----------------------------
{
  const caught = withCorruption("runs/index.json", (s) => s.replace('"checksTotal": 121', '"checksTotal": 999'), () =>
    scriptFails("render:check"),
  );
  record("render:check detects a doctored index", caught, "planted checksTotal 121 -> 999");
}

// ---- 3. readme:check (milestone drift) ----------------------------------
{
  const caught = withCorruption("README.md", (s) => s.replace(/Status: M0[–-]M6 landed/, "Status: M0-M9 landed"), () =>
    scriptFails("readme:check"),
  );
  record("readme:check detects an overclaimed milestone", caught, "planted M6 -> M9");
}

// ---- 4. brand:check (brand asset drift) ---------------------------------
{
  const caught = withCorruption("apps/web/public/brand/glyph.svg", (s) => s.replace('stroke-width="3.008"', 'stroke-width="9.999"'), () =>
    scriptFails("brand:check"),
  );
  record("brand:check detects an edited brand asset", caught, "planted stroke-width 3.008 -> 9.999");
}

// ---- 5. schema:check ----------------------------------------------------
{
  const caught = withCorruption("schemas/run-record.v1.json", (s) => s.replace('"formatVersion"', '"formatVersionX"'), () =>
    scriptFails("schema:check"),
  );
  record("schema:check detects a doctored schema", caught, "planted formatVersion -> formatVersionX");
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${String(results.length - failed.length)}/${String(results.length)} checkers proved they can fail`);
if (failed.length > 0) {
  console.error("A checker did NOT catch its planted defect — its green is meaningless:");
  for (const f of failed) console.error(`  ${f.name}`);
  process.exit(1);
}
