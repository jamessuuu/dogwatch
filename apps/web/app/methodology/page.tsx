import type { Metadata } from "next";

export const metadata: Metadata = { title: "Methodology" };

const RUBRIC: { id: string; catches: string; code: string }[] = [
  { id: "R1", catches: "checks[] is empty, or a check is stuck at a non-terminal verdict", code: "E_NO_CHECKS / E_CHECK_NONTERMINAL" },
  { id: "R2 / R3", catches: "a finding pointing at a check that isn't a finding, or a finding-verdict check with no finding for it", code: "E_ORPHAN_FINDING / E_UNREPORTED_CHECK" },
  { id: "R4", catches: "a finding without a real source: an absolute https URL, a retrieval timestamp inside the run window, and an evidence path that resolves inside the same record", code: "E_UNSOURCED_FINDING" },
  { id: "R5", catches: "an empty-findings run whose absence-of-evidence section doesn't match the actual pass count", code: "E_NO_ABSENCE_SECTION" },
  { id: "R6", catches: "a skipped or errored check with no machine-readable reason, or missing from notChecked", code: "E_SILENT_SKIP" },
  { id: "R7 / R8", catches: "an action or gate not backed by a real, matching audit event", code: "E_ACTION_UNBACKED / E_GATE_UNBACKED" },
  { id: "R9", catches: "a cost that doesn't sum to its own breakdown, or LLM usage claimed with no provider-reported tokens behind it", code: "E_COST_UNBACKED" },
  { id: "R10", catches: "an advisory note published with no model call behind it, or citing a finding id or URL that isn't in this record's own evidence", code: "E_ADVISORY_UNGROUNDED" },
  { id: "R11", catches: "a broken or unverified audit hash chain, or a discontinuity from the previous run with no gap record explaining it", code: "E_CHAIN_BROKEN" },
  { id: "R12", catches: "a record whose content no longer matches the hash committed alongside it — the tamper-evidence check", code: "E_RECORD_TAMPERED" },
  { id: "R13", catches: "a finding statement that wasn't re-derived byte-for-byte from stored evidence by the rule that owns it", code: "E_MANUFACTURED_FINDING" },
  { id: "R14", catches: "a metric wearing a severity, or sharing an id with a check or finding", code: "E_METRIC_AS_FINDING" },
  { id: "R15", catches: "a secret-shaped string, or a header outside the published allowlist, anywhere in a record", code: "E_SECRET_LEAK" },
];

export default function MethodologyPage() {
  return (
    <div className="flex flex-col gap-10 text-ink">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Methodology</h1>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          What dogwatch checks, how it decides a statement is honest enough to publish, and what
          it deliberately does not claim.
        </p>
      </div>

      <section className="flex flex-col gap-4 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold">The honesty rubric</h2>
        <p className="max-w-prose text-sm">
          <code className="font-mono text-xs">dogwatch verify</code> runs on every committed
          record on every push. Fifteen rules, each with an exact error code — a violation that
          merely warns fails the build. The full schema is published at{" "}
          <a href="https://github.com/jamessuuu/dogwatch/blob/main/schemas/run-record.v1.json" className="underline decoration-rule underline-offset-2 hover:decoration-ink">
            schemas/run-record.v1.json
          </a>
          , generated from the same Zod source of truth the runner and this rubric both use — the
          schema cannot drift from what the code actually checks.
        </p>
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {RUBRIC.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
              <span className="w-14 shrink-0 font-mono text-sm font-semibold">{r.id}</span>
              <span className="flex-1 text-sm text-ink-muted">{r.catches}</span>
              <span className="shrink-0 font-mono text-xs text-ink-muted">{r.code}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold">The anti-manufacture rule (R13)</h2>
        <p className="max-w-prose text-sm">
          A finding&apos;s statement is never written by a human or a model — it is the return
          value of that rule&apos;s own template function, applied to recorded evidence. R13
          re-derives every finding from scratch, offline, over the stored evidence, and requires
          the result to match the published statement byte-for-byte. There is no other code path
          in the type system that can produce a <code className="font-mono text-xs">Finding</code>
          . The advisory model (below) cannot create one either — its output is a separate,
          clearly labelled field, and the rule table decides severity and action regardless of
          what the model says.
        </p>
      </section>

      <section className="flex flex-col gap-3 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold">Advisory model, and the disagreement rate</h2>
        <p className="max-w-prose text-sm">
          On a night with findings, one advisory call (Haiku 4.5, a forced tool schema, Zod-
          validated on the way back) reads the same structured evidence already published in the
          record — never a page body — and returns a severity, a short note, and a proposed
          action. The proposed action is published and ignored: the deterministic rule table
          already decided what happens. When the model&apos;s severity disagrees with the rule&apos;s
          own, the record publishes both, plus <code className="font-mono text-xs">agreesWithRule: false</code> —
          the disagreement rate between advisory and rule severity is a real, published artifact,
          not a claim taken on faith. A quiet night makes no model call at all:{" "}
          <code className="font-mono text-xs">llm: {"{"} calls: 0, reason: "no_findings" {"}"}</code>.
        </p>
      </section>

      <section className="flex flex-col gap-3 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold">The autonomy ladder</h2>
        <p className="max-w-prose text-sm">
          <strong>L2, automatic:</strong> everything inside the dogwatch repo — publishing the
          record, committing artifacts, opening and closing dogwatch&apos;s own gate issues.{" "}
          <strong>L3, human gate:</strong> every write to a repo dogwatch does not own. Nothing
          dogwatch can do touches a system James does not operate. Publishing the record itself is
          deliberately ungated — withholding a run behind an approval would make the watch only as
          live as an inbox, and would defeat the one promise this product makes.
        </p>
      </section>

      <section className="flex flex-col gap-3 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold">Limitations</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            This is an operated instance, not a product you install. Nothing here is published to
            npm; forking and pointing it at your own surfaces is unsupported.
          </li>
          <li>dogwatch watches six surfaces I operate and makes no claim about anyone else&apos;s software.</li>
          <li>
            One request, one runner, one region, once a night — this is not an uptime claim. There
            is no SLA, no paging, and no synthetic performance score.
          </li>
          <li>Timings and download counts are metrics: recorded and rendered, never judged, never a finding.</li>
        </ul>
      </section>
    </div>
  );
}
