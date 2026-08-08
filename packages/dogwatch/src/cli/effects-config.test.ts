import { describe, expect, it } from "vitest";
import { reconcilePreviousIndeterminates } from "./effects-config.js";
import { FakeGithubTransport } from "../effects/github-transport.js";
import { executeApprovedAction } from "../effects/execute.js";
import { createSluice, MemoryStore } from "@jamessuuu/sluice";
import { makeMinimalRecord } from "../record/test-helper.js";
import type { Action } from "../record/schema.js";

const indeterminateAction: Action = {
  id: "A-indet-1",
  kind: "issue.open",
  target: "jamessuuu/agentjames",
  status: "indeterminate",
  effectKey: "effect-key-x",
  effectOutcome: "we do not know whether the issue was created; not retried (see reconciliation)",
};

describe("reconcilePreviousIndeterminates (cli wiring around src/effects/reconcile.ts)", () => {
  it("returns [] when there is no previous record", async () => {
    expect(await reconcilePreviousIndeterminates(null, new FakeGithubTransport())).toEqual([]);
  });

  it("returns [] when no transport is configured (no GITHUB_TOKEN)", async () => {
    const prev = makeMinimalRecord({ runId: "run-1", actions: [indeterminateAction] });
    expect(await reconcilePreviousIndeterminates(prev, undefined)).toEqual([]);
  });

  it("returns [] when the previous record has nothing indeterminate", async () => {
    const prev = makeMinimalRecord({ runId: "run-1", actions: [] });
    expect(await reconcilePreviousIndeterminates(prev, new FakeGithubTransport())).toEqual([]);
  });

  it("reconciles a base-record indeterminate action: marker found -> executed with reconciliationOf set", async () => {
    const transport = new FakeGithubTransport({ indeterminateOn: () => true });
    const store = new MemoryStore();
    const sluice = createSluice({ store, namespace: "test", owner: "test" });
    // Make the marker actually exist in the ledger, same as a real
    // indeterminate execute would have (FakeGithubTransport's own
    // documented "the write landed, the response didn't" contract).
    await executeApprovedAction(
      { runId: "run-1", recordPath: "runs/2026/x.json", actionId: "A-indet-1", effectKey: "effect-key-x", targetRepo: "jamessuuu/agentjames" },
      { title: "t", body: "b" },
      { sluice, githubTransport: transport }
    );

    const prev = makeMinimalRecord({ runId: "run-1", actions: [indeterminateAction] });
    const resolved = await reconcilePreviousIndeterminates(prev, transport);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.status).toBe("executed");
    expect(resolved[0]?.reconciliationOf).toBe("run-1:A-indet-1");
  });

  it("does not re-reconcile an action that already has a resolution referencing it", async () => {
    const alreadyResolved: Action = {
      id: "A-recon-A-indet-1",
      kind: "issue.open",
      target: "jamessuuu/agentjames",
      status: "executed",
      effectKey: "effect-key-x",
      effectOutcome: "issue https://github.com/jamessuuu/agentjames/issues/1 (reconciled: found existing via marker search)",
      artifactUrl: "https://github.com/jamessuuu/agentjames/issues/1",
      reconciliationOf: "run-1:A-indet-1",
    };
    const prev = makeMinimalRecord({
      runId: "run-1",
      actions: [indeterminateAction],
      amendments: [
        {
          at: "2026-08-10T00:00:00.000Z",
          by: "dogwatch:watch",
          kind: "reconciliation",
          events: [],
          actions: [alreadyResolved],
          gates: [],
          refusals: [],
          amendmentHash: "hash-1",
        },
      ],
    });
    const transport = new FakeGithubTransport();
    const resolved = await reconcilePreviousIndeterminates(prev, transport);
    expect(resolved).toHaveLength(0);
    // No search was even needed — nothing pending.
    expect(transport.openCalls).toHaveLength(0);
  });
});
