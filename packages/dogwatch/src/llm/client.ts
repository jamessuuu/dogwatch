/**
 * Real Anthropic client (SPEC §4/§8/README): the ONLY file in the whole
 * pipeline permitted to import `@anthropic-ai/sdk`. Constructing this class
 * does not, by itself, make a network call — a call happens only when
 * `callForcedTool` is invoked, which happens only from `pipeline.ts`'s
 * advisory path, which only runs when the caller wires a real client in
 * (`cli/watch.ts`, gated on `ANTHROPIC_API_KEY` being present). No test in
 * this repo constructs this class or calls it — every test uses
 * `test-helper.ts`'s `FakeLlmClient` instead (CRITICAL: no live API call
 * anywhere in tests or in this build).
 */
import Anthropic from "@anthropic-ai/sdk";
import { LlmError, type LlmClient, type LlmToolRequest, type LlmToolResponse } from "./types.js";

export function createAnthropicLlmClient(apiKey: string): LlmClient {
  const client = new Anthropic({ apiKey });
  return {
    async callForcedTool(request: LlmToolRequest): Promise<LlmToolResponse> {
      let response: Awaited<ReturnType<typeof client.messages.create>>;
      try {
        response = await client.messages.create(
          {
            model: request.model,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: [{ role: "user", content: request.userContent }],
            tools: [
              {
                type: "custom",
                name: request.toolName,
                description: request.toolDescription,
                input_schema: request.toolInputSchema as Anthropic.Tool.InputSchema,
                strict: true,
              },
            ],
            tool_choice: { type: "tool", name: request.toolName },
          },
          request.timeoutMs === undefined ? undefined : { timeout: request.timeoutMs }
        );
      } catch (cause) {
        if (cause instanceof Anthropic.APIConnectionTimeoutError || cause instanceof Anthropic.APIUserAbortError) {
          throw new LlmError("timeout", `triage call to ${request.model} timed out`, { cause });
        }
        if (cause instanceof Anthropic.AnthropicError) {
          throw new LlmError("api_error", `triage call to ${request.model} failed: ${cause.message}`, { cause });
        }
        throw new LlmError("api_error", `triage call to ${request.model} failed with an unrecognized error`, { cause });
      }

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === request.toolName
      );
      if (toolUse === undefined) {
        // A forced tool_choice should always yield exactly this block; its
        // absence (e.g. stop_reason "refusal") is itself schema-invalid
        // output from the caller's perspective — surfaced as `toolInput:
        // undefined`, which will fail `triage.ts`'s Zod parse and correctly
        // degrade as `schema_reject` rather than crashing here.
        return {
          toolInput: undefined,
          usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        };
      }
      return {
        toolInput: toolUse.input,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      };
    },
  };
}
