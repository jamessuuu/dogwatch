/**
 * SPEC §9 reconciliation: "onIndeterminate:'fail' ⇒ published verbatim...,
 * and the next run reconciles by searching the repo for the hidden marker
 * <!-- dogwatch:effect:<key> --> and publishes the resolution." Two real
 * outcomes: the marker IS found (the effect landed after all) and it is
 * NOT found (it genuinely never landed) — both must be a real, evidenced
 * search against the fake transport, never a guess.
 */
import { createSluice, MemoryStore } from "@jamessuuu/sluice";
import { describe, expect, it } from "vitest";
import { executeApprovedAction } from "./execute.js";
import { FakeGithubTransport } from "./github-transport.js";
import { effectMarker, reconcileIndeterminateAction } from "./reconcile.js";
import type { ResumeContext } from "./resume-context.js";

const resumeCtx: ResumeContext = {
  runId: "run-1",
  recordPath: "runs/2026/2026-08-09-run-1.json",
  actionId: "A-abc123",
  effectKey: "effect-key-1",
  targetRepo: "jamessuuu/agentjames",
};

describe("reconcileIndeterminateAction", () => {
  it("marker found: the effect DID land — publishes executed with the found issue's URL, reconciliationOf set", async () => {
    const transport = new FakeGithubTransport({ indeterminateOn: () => true });
    const store = new MemoryStore();
    const sluice = createSluice({ store, namespace: "test", owner: "test-owner" });

    // Attempt 1: the effect throws Indeterminate, but the ledger shows the
    // write actually landed (FakeGithubTransport's documented contract).
    const first = await executeApprovedAction(resumeCtx, { title: "t", body: "b" }, { sluice, githubTransport: transport });
    expect(first.status).toBe("indeterminate");
    expect(transport.issuesOpened(resumeCtx.targetRepo)).toHaveLength(1);

    const result = await reconcileIndeterminateAction(
      { runId: resumeCtx.runId, actionId: resumeCtx.actionId, effectKey: resumeCtx.effectKey, targetRepo: resumeCtx.targetRepo },
      transport
    );
    expect(result.action.status).toBe("executed");
    expect(result.action.artifactUrl).toContain(resumeCtx.targetRepo);
    expect(result.action.reconciliationOf).toBe(`${resumeCtx.runId}:${resumeCtx.actionId}`);
    // Still exactly one issue — reconciliation never creates a second one.
    expect(transport.issuesOpened(resumeCtx.targetRepo)).toHaveLength(1);
  });

  it("marker not found: the effect genuinely never landed — publishes refused{effect_failed}, reconciliationOf set", async () => {
    const transport = new FakeGithubTransport();
    const result = await reconcileIndeterminateAction(
      { runId: resumeCtx.runId, actionId: resumeCtx.actionId, effectKey: resumeCtx.effectKey, targetRepo: resumeCtx.targetRepo },
      transport
    );
    expect(result.action.status).toBe("refused");
    expect(result.action.reasonCode).toBe("effect_failed");
    expect(result.action.reconciliationOf).toBe(`${resumeCtx.runId}:${resumeCtx.actionId}`);
    expect(transport.issuesOpened(resumeCtx.targetRepo)).toHaveLength(0);
  });

  it("effectMarker is byte-identical between what execute.ts stamps and what reconcile.ts searches for", async () => {
    const transport = new FakeGithubTransport();
    const store = new MemoryStore();
    const sluice = createSluice({ store, namespace: "test", owner: "test-owner" });
    await executeApprovedAction(resumeCtx, { title: "t", body: "b" }, { sluice, githubTransport: transport });
    const found = await transport.findIssueByMarker(resumeCtx.targetRepo, effectMarker(resumeCtx.effectKey));
    expect(found).not.toBeNull();
  });
});
