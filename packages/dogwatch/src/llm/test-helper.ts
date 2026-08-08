/**
 * `FakeLlmClient` — the ONLY `LlmClient` any test in this repo constructs
 * (CRITICAL, per the M3 task: no live API call anywhere in tests or in this
 * build). Deliberately NOT a `.test.ts` file (vitest would try to run it as
 * a zero-test suite and fail); a plain module other test files import from,
 * mirroring `src/record/test-helper.ts`.
 */
import type { LlmClient, LlmToolRequest, LlmToolResponse } from "./types.js";

export type FakeLlmResponder = (request: LlmToolRequest) => LlmToolResponse | Promise<LlmToolResponse>;

/** Queue-based fake: each call to `callForcedTool` consumes the next queued
 * responder (or throws if the queue is empty — a test forgetting to queue
 * enough responses should fail loudly, not silently reuse the last one). */
export function createFakeLlmClient(responders: readonly FakeLlmResponder[]): LlmClient & { readonly calls: LlmToolRequest[] } {
  const queue = [...responders];
  const calls: LlmToolRequest[] = [];
  return {
    calls,
    async callForcedTool(request: LlmToolRequest): Promise<LlmToolResponse> {
      calls.push(request);
      const responder = queue.shift();
      if (responder === undefined) {
        throw new Error("FakeLlmClient: callForcedTool invoked more times than responders were queued");
      }
      return responder(request);
    },
  };
}

/** Convenience: a client whose every call returns the same fixed tool input
 * and usage, unlimited calls. */
export function fakeLlmClientAlwaysReturning(toolInput: unknown, usage: LlmToolResponse["usage"]): LlmClient & { readonly calls: LlmToolRequest[] } {
  const calls: LlmToolRequest[] = [];
  return {
    calls,
    // eslint-disable-next-line @typescript-eslint/require-await -- interface parity with the real client
    async callForcedTool(request: LlmToolRequest): Promise<LlmToolResponse> {
      calls.push(request);
      return { toolInput, usage };
    },
  };
}

/** Convenience: a client whose every call throws the given error. */
export function fakeLlmClientAlwaysThrowing(error: unknown): LlmClient {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await -- interface parity; the throw is synchronous-in-spirit
    async callForcedTool(): Promise<LlmToolResponse> {
      throw error;
    },
  };
}
