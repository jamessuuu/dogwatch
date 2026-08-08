/**
 * Proves the second half of `draft.ts`'s doc comment: SPEC §8/§12 says
 * `draft` must be "wired but unreachable" until M5's gate machinery exists.
 * `draft.test.ts` proves the interface works when called directly; this
 * test statically greps every production `.ts` file OUTSIDE `src/llm`
 * (tests excluded — a test calling `draft` directly, as `draft.test.ts`
 * does, is exactly how you'd verify the interface, not a reachability
 * violation) for a call to `draft(` and fails the build the moment any
 * caller shows up before M5 lands the gate flow this function requires.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(import.meta.dirname, "..");

function listTsFilesOutsideLlm(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "llm") continue; // draft.ts's own module — not the reachability boundary
      listTsFilesOutsideLlm(full, out);
      continue;
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const DRAFT_CALL_RE = /\bdraft\s*\(/;
// A bare `draft(` call is what matters (SPEC's "wire the interface and
// leave it unreachable" is about invocation, not about the identifier
// merely being importable via `llm/index.ts`'s aggregate export).

describe("draft() is unreachable from the shipped pipeline (SPEC §8/§12 M5)", () => {
  it("no production file outside src/llm calls draft(...)", () => {
    const files = listTsFilesOutsideLlm(SRC_ROOT);
    expect(files.length).toBeGreaterThan(10); // sanity: the walk actually found the tree
    const offenders = files.filter((f) => DRAFT_CALL_RE.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("record/build-run.ts's advisory wiring never imports draft.js", () => {
    const buildRunSrc = readFileSync(join(SRC_ROOT, "record", "build-run.ts"), "utf8");
    expect(buildRunSrc).not.toMatch(/from ["'].*\/draft\.js["']/);
  });

  it("the pipeline (src/llm/pipeline.ts) itself never calls draft(...) either — only triage", () => {
    const pipelineSrc = readFileSync(join(SRC_ROOT, "llm", "pipeline.ts"), "utf8");
    expect(DRAFT_CALL_RE.test(pipelineSrc)).toBe(false);
  });
});
