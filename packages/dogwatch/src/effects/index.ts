/** Aggregate export for `src/effects` (SPEC §4/§12 M5): sluice wiring for
 * anything that leaves the dogwatch repo. `cli/watch.ts`, `cli/resume.ts`,
 * `cli/gate.ts`, and `apps/web`'s API route import from here. */
export * from "./github-transport.js";
export * from "./notify.js";
export * from "./resume-context.js";
export * from "./propose.js";
export * from "./execute.js";
export * from "./reconcile.js";
export * from "./decide.js";
export * from "./gate-entry.js";
export * from "./resume.js";
