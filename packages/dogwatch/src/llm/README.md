# src/llm — lands at M3

The advisory summarizer (`triage`) and issue drafter (`draft`) — the only
two model calls in the whole product, both advisory, neither able to gate
anything (SPEC §8). This is also the **only file** in the pipeline permitted
to import `@anthropic-ai/sdk` (SPEC §4): the `Finding` type itself does not
admit a free-text field a model could fill in, so even a bug here cannot
manufacture a finding (R13) — it can only produce `advisory.note` /
`draft.title` / `draft.body`, both explicitly labelled and both requiring a
human's approval before anything public happens.

M0-M2 publish `llm: { calls: 0, reason: "no_findings" | "not_implemented" }`
in every run record — `"not_implemented"` is the honest reason on any run
that had findings but (because this module does not exist yet) made no
model call, so the record never claims the quiet-night reason when it
wasn't quiet.
