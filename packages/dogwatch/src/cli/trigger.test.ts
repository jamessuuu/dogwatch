import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTrigger, resolveRunKind } from "./trigger.js";

const GH_ENV_KEYS = [
  "GITHUB_EVENT_NAME",
  "GITHUB_WORKFLOW",
  "GITHUB_SERVER_URL",
  "GITHUB_REPOSITORY",
  "GITHUB_RUN_ID",
  "GITHUB_ACTOR",
  "USERNAME",
  "USER",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveRunKind — Critical 1: kind:\"scheduled\" must be reachable", () => {
  it('a real cron firing (GITHUB_EVENT_NAME="schedule") produces kind:"scheduled"', () => {
    vi.stubEnv("GITHUB_EVENT_NAME", "schedule");
    expect(resolveRunKind()).toBe("scheduled");
  });

  it('a manual workflow_dispatch re-run (GITHUB_EVENT_NAME="workflow_dispatch") produces kind:"manual", not "scheduled"', () => {
    vi.stubEnv("GITHUB_EVENT_NAME", "workflow_dispatch");
    expect(resolveRunKind()).toBe("manual");
  });

  it("a local CLI invocation (no GITHUB_EVENT_NAME at all) produces kind:\"manual\"", () => {
    for (const key of GH_ENV_KEYS) vi.stubEnv(key, undefined);
    expect(resolveRunKind()).toBe("manual");
  });

  it("an unrelated CI event (e.g. push, pull_request) never produces \"scheduled\"", () => {
    vi.stubEnv("GITHUB_EVENT_NAME", "push");
    expect(resolveRunKind()).toBe("manual");
  });
});

describe("buildTrigger", () => {
  it("reads real GitHub Actions values when present (workflow/runUrl/actor)", () => {
    vi.stubEnv("GITHUB_WORKFLOW", "watch");
    vi.stubEnv("GITHUB_SERVER_URL", "https://github.com");
    vi.stubEnv("GITHUB_REPOSITORY", "jamessuuu/dogwatch");
    vi.stubEnv("GITHUB_RUN_ID", "123456789");
    vi.stubEnv("GITHUB_ACTOR", "octocat");

    expect(buildTrigger()).toEqual({
      workflow: "watch",
      runUrl: "https://github.com/jamessuuu/dogwatch/actions/runs/123456789",
      actor: "octocat",
    });
  });

  it("falls back to null workflow/runUrl and the local machine actor when nothing is set", () => {
    for (const key of GH_ENV_KEYS) vi.stubEnv(key, undefined);
    vi.stubEnv("USERNAME", "admin");

    expect(buildTrigger()).toEqual({ workflow: null, runUrl: null, actor: "admin" });
  });

  it("runUrl stays null unless ALL THREE of server_url/repository/run_id are present (a partial set is not a real Actions run)", () => {
    for (const key of GH_ENV_KEYS) vi.stubEnv(key, undefined);
    vi.stubEnv("GITHUB_SERVER_URL", "https://github.com");
    vi.stubEnv("GITHUB_REPOSITORY", "jamessuuu/dogwatch");
    // GITHUB_RUN_ID deliberately left unset.

    expect(buildTrigger().runUrl).toBeNull();
  });
});
