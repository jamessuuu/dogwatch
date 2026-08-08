import type { RunKind, Trigger } from "../record/schema.js";

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

/**
 * The record's `kind` (SPEC §3: `"scheduled"|"manual"|"gap"` — `"gap"` is a
 * separate, not-yet-built path for a missed night, SPEC §3 Decision 3).
 * GitHub Actions sets `GITHUB_EVENT_NAME` to the exact event that started the
 * run: `"schedule"` for a real cron firing of `watch.yml`, `"workflow_dispatch"`
 * for a manual re-run button/API call, and it is unset entirely for a local
 * `dogwatch watch` invocation. Only a genuine cron firing is honestly
 * "scheduled" — a manual re-run (from Actions or a local shell) is "manual"
 * even though it runs the same workflow, matching `buildTrigger()`'s own
 * "real value when present, honest fallback otherwise" shape.
 */
export function resolveRunKind(): RunKind {
  return process.env.GITHUB_EVENT_NAME === "schedule" ? "scheduled" : "manual";
}
