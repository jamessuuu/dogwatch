/**
 * Proves `draft()` is a real, working interface (SPEC §8/M5: "wire the
 * interface") — it is simply never called by anything in this build's
 * shipped pipeline. See `unreachable.test.ts` for the proof of the second
 * half of that sentence.
 */
import { describe, expect, it } from "vitest";
import { draft, DraftToolOutputSchema } from "./draft.js";
import { createFakeLlmClient, fakeLlmClientAlwaysThrowing } from "./test-helper.js";
import { LlmError } from "./types.js";
import { makeFinding } from "../record/test-helper.js";

describe("draft — the interface works when called directly", () => {
  it("ok: returns a validated title/body from a forced tool call", async () => {
    const finding = makeFinding();
    const client = createFakeLlmClient([
      () => ({ toolInput: { title: "reach.status_not_200 on agentjames", body: "Details..." }, usage: { inputTokens: 300, outputTokens: 60 } }),
    ]);
    const outcome = await draft({ client, finding });
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") throw new Error("expected ok");
    expect(outcome.output.title).toContain("reach.status_not_200");
    expect(outcome.usage).toEqual({ inputTokens: 300, outputTokens: 60 });
  });

  it("schema_reject: an empty title fails validation but still reports real usage", async () => {
    const finding = makeFinding();
    const client = createFakeLlmClient([() => ({ toolInput: { title: "", body: "x" }, usage: { inputTokens: 300, outputTokens: 60 } })]);
    const outcome = await draft({ client, finding });
    expect(outcome.kind).toBe("schema_reject");
    if (outcome.kind !== "schema_reject") throw new Error("expected schema_reject");
    expect(outcome.usage).toEqual({ inputTokens: 300, outputTokens: 60 });
  });

  it("transport_error: classifies LlmError('timeout') correctly", async () => {
    const finding = makeFinding();
    const client = fakeLlmClientAlwaysThrowing(new LlmError("timeout", "slow"));
    const outcome = await draft({ client, finding });
    expect(outcome).toEqual({ kind: "transport_error", errorKind: "timeout", detail: "slow" });
  });

  it("evidence sent to the model never includes a page body — only the finding's own structured fields", async () => {
    const finding = makeFinding();
    const client = createFakeLlmClient([() => ({ toolInput: { title: "t", body: "b" }, usage: { inputTokens: 1, outputTokens: 1 } })]);
    await draft({ client, finding });
    const sent = client.calls[0];
    expect(sent?.userContent).toContain("<untrusted-evidence>");
    expect(sent?.userContent).not.toContain("bodyText");
  });
});

describe("DraftToolOutputSchema", () => {
  it("matches record/schema.ts's ActionDraftSchema's title/body shape", () => {
    expect(DraftToolOutputSchema.safeParse({ title: "A title", body: "A body" }).success).toBe(true);
    expect(DraftToolOutputSchema.safeParse({ title: "", body: "A body" }).success).toBe(false);
  });
});
