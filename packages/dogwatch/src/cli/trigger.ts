import type { Trigger } from "../record/schema.js";

/** Reads GitHub Actions env vars when present; falls back to an honest
 * "local" actor for a manual CLI invocation (SPEC §3 `trigger`). */
export function buildTrigger(): Trigger {
  const workflow = process.env.GITHUB_WORKFLOW ?? null;
  const runUrl =
    process.env.GITHUB_SERVER_URL !== undefined &&
    process.env.GITHUB_REPOSITORY !== undefined &&
    process.env.GITHUB_RUN_ID !== undefined
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;
  const actor = process.env.GITHUB_ACTOR ?? process.env.USERNAME ?? process.env.USER ?? "local";
  return { workflow, runUrl, actor };
}
