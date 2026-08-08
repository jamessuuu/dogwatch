/**
 * The injected LLM client interface (SPEC §4/§8, mirrors `src/probe`'s
 * `HttpProbe` pattern): `src/llm` is the only module permitted to import
 * `@anthropic-ai/sdk` (see `client.ts`), and everything downstream (the
 * triage/draft orchestration in this same directory) takes an `LlmClient` as
 * a parameter — so a fake client stands in for every test (CRITICAL: no
 * live API call anywhere in tests or in this build) and, later, the eval
 * suite can replay recorded transcripts the same way `src/probe/replay.ts`
 * does for HTTP.
 */

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

/** One forced-tool-schema request (SPEC §8: "forced tool schema" — the
 * caller gets back exactly one tool call, never free-text). */
export interface LlmToolRequest {
  model: string;
  maxTokens: number;
  /** Fixed, trusted instruction text. MUST NOT contain any per-run
   * evidence — see `triage.ts`'s injection-guard comment. */
  system: string;
  /** The untrusted evidence bundle, already delimited by the caller. */
  userContent: string;
  toolName: string;
  toolDescription: string;
  /** JSON Schema (draft 2020-12), generated from the same Zod schema the
   * caller validates the response against (`z.toJSONSchema`) — single
   * source of truth, never hand-duplicated. */
  toolInputSchema: Record<string, unknown>;
  timeoutMs?: number | undefined;
}

export interface LlmToolResponse {
  /** Not yet Zod-validated — the caller (`triage.ts`) owns that, since only
   * it knows which schema this particular tool call used. */
  toolInput: unknown;
  usage: LlmUsage;
}

export interface LlmClient {
  callForcedTool(request: LlmToolRequest): Promise<LlmToolResponse>;
}

/** Thrown by an `LlmClient` on transport/API-level failure — mirrors
 * `src/probe/types.ts`'s `ProbeError` so the degrade-path classifier
 * (`classifyLlmFailure` in `pipeline.ts`) can tell "the model declined to
 * answer usefully" (a schema-reject, handled by the caller reading
 * `toolInput`) apart from "we never got an answer at all". */
export class LlmError extends Error {
  readonly code: "timeout" | "api_error";

  constructor(code: "timeout" | "api_error", message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LlmError";
    this.code = code;
  }
}
