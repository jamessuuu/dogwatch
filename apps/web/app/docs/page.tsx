import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Docs" };

const RUBRIC: { id: string; prevents: string; code: string }[] = [
  { id: "R1", prevents: "a run publishing with no checks at all, or a check stuck in a non-terminal state forever", code: "E_NO_CHECKS / E_CHECK_NONTERMINAL" },
  { id: "R2", prevents: "a finding pointing at a check that isn't itself verdicted a finding", code: "E_ORPHAN_FINDING" },
  { id: "R3", prevents: "a check verdicted \"finding\" existing with no real finding object behind it", code: "E_UNREPORTED_CHECK" },
  { id: "R4", prevents: "a finding existing with no real source: an absolute https URL, a retrieval timestamp inside the run window, and an evidence path that resolves inside the same record", code: "E_UNSOURCED_FINDING" },
  { id: "R5", prevents: "a quiet run skipping the honest \"checked and found nothing\" statement, or that statement's numbers not matching the actual pass count", code: "E_NO_ABSENCE_SECTION" },
  { id: "R6", prevents: "a skipped or errored check being silently dropped instead of named with a machine-readable reason", code: "E_SILENT_SKIP" },
  { id: "R7", prevents: "an action being recorded as taken with no real, matching audit event behind it", code: "E_ACTION_UNBACKED" },
  { id: "R8", prevents: "a gate being recorded as resolved with no real, matching audit event behind it", code: "E_GATE_UNBACKED" },
  { id: "R9", prevents: "a cost figure that doesn't sum to its own breakdown, or LLM usage claimed with no provider-reported tokens behind it", code: "E_COST_UNBACKED" },
  { id: "R10", prevents: "an advisory note being published with no model call behind it, or citing a finding id or URL outside this record's own evidence", code: "E_ADVISORY_UNGROUNDED" },
  { id: "R11", prevents: "a broken or unverified audit hash chain, or a gap between runs going unexplained", code: "E_CHAIN_BROKEN" },
  { id: "R12", prevents: "a published record being retroactively edited without it showing — the tamper-evidence check", code: "E_RECORD_TAMPERED" },
  { id: "R13", prevents: "a model or a human hand-writing a finding's text — every statement must be re-derived byte-for-byte from stored evidence by the rule that owns it", code: "E_MANUFACTURED_FINDING" },
  { id: "R14", prevents: "a metric (recorded, never judged) being dressed up as a finding by carrying a severity", code: "E_METRIC_AS_FINDING" },
  { id: "R15", prevents: "a secret-shaped string, or a header outside the published allowlist, reaching a published record", code: "E_SECRET_LEAK" },
];

const FAILURE_MODES: { situation: string; contract: string }[] = [
  { situation: "Neon suspended or over quota", contract: "The run degrades to an in-memory store: probes and findings stay valid (they're pure functions of evidence), the record publishes audit.store:\"memory\" and chain.anchored:false, and no gate can open — every proposed action is refused with reasonCode:\"store_unavailable\". Fails closed, never fails silent." },
  { situation: "The runner is killed mid-run", contract: "Nothing is published for that night. The next run emits a kind:\"gap\" record citing the failed Actions run before its own — a missing night is a published artifact, not silence that looks like health." },
  { situation: "Duplicate or overlapping runs", contract: "A concurrency group prevents overlapping watch runs. Two run records are legal (they're different runs); duplicate effects are not — intent-derived idempotency keys make a second attempt at the same effect a no-op." },
  { situation: "The same finding recurs for 40 nights", contract: "One issue, ever. The effect key is the finding's fingerprint with a 90-day retention; nights 2 through 40 publish a refusal with reasonCode:\"duplicate_suppressed\" instead of filing a second issue." },
  { situation: "The GitHub API fails mid issue-create", contract: "A retryable failure is retried and published. An indeterminate outcome is never retried and is published verbatim (\"we do not know whether the issue was created\") — the next run reconciles by searching for a hidden marker and publishes the resolution." },
  { situation: "A gate is approved and rejected in a race", contract: "First writer wins; the second decision returns the already-recorded outcome. Both attempts appear in the audit trail." },
  { situation: "An approval token is stolen or replayed", contract: "Single-use, burned by the deciding update, 48-hour expiry, timing-safe comparison. A replay fails with E_BAD_TOKEN. The token itself never appears in any published artifact." },
  { situation: "A gate is never decided", contract: "48 hours ⇒ timed out ⇒ reject. Fail closed. A published refusal, not an auto-approve — no auto-approve exists anywhere in this product." },
  { situation: "Vercel is down", contract: "Every page is static and keeps rendering from the last deploy; only /api/gate/decide is gone, so decisions route through workflow_dispatch or the CLI instead. The record JSON committed to git is the canonical source, not the site." },
  { situation: "A GitHub or npm API call is rate-limited", contract: "The check's verdict is error with the real code, listed in notChecked. Never counted as a pass." },
  { situation: "A sibling site isn't deployed yet", contract: "skipped with reasonCode:\"not_published\" and the reason printed — an unbuilt sibling is not a finding." },
  { situation: "A finding flaps between runs", contract: "A medium finding needs two consecutive runs before any action is proposed; high acts on first sight. Night one publishes status:\"unconfirmed\"." },
  { situation: "A record would exceed 512 KB", contract: "Evidence bodies are truncated with truncated:true. A truncated check may not produce a high-severity finding." },
  { situation: "dogwatch finds a fault in dogwatch itself", contract: "Filed in its own repo, ungated (L2) — documented behaviour, not an exception to the rule." },
];

const FIELD_GROUPS: { title: string; fields: { name: string; note: string }[] }[] = [
  {
    title: "Identity and provenance",
    fields: [
      { name: "runId", note: "a UUIDv7, sortable by time, unique to this run" },
      { name: "kind", note: "\"scheduled\" | \"manual\" | \"gap\" — how this run was triggered, never fudged" },
      { name: "commit", note: "the exact git commit the runner had checked out" },
      { name: "targetsHash", note: "sha256 of targets.json at run time — a config change is visible in the diff" },
      { name: "trigger", note: "the workflow name, the Actions run URL, and who or what fired it" },
    ],
  },
  {
    title: "Timing",
    fields: [
      { name: "scheduledFor", note: "when the schedule expected this run, if it was a scheduled one" },
      { name: "startedAt / endedAt", note: "ISO-8601 timestamps bounding every check this run made" },
    ],
  },
  {
    title: "Checks, findings, and metrics",
    fields: [
      { name: "checks[]", note: "every probe made: the request, the evidence captured, the verdict, and a curl line to reproduce it yourself" },
      { name: "findings[]", note: "confirmed problems, each with ≥1 source (URL, method, status, retrieval time, and a path into this record's own evidence)" },
      { name: "absenceOfEvidence", note: "on a quiet run (and every run), the honest count of what came back clean and what didn't run at all, with reasons" },
      { name: "metrics[]", note: "numbers recorded and rendered, never judged — a byte count moving is not an event" },
    ],
  },
  {
    title: "Actions, gates, and refusals",
    fields: [
      { name: "actions[]", note: "what dogwatch proposed doing about a finding, and its status through the gate" },
      { name: "gates[]", note: "every gate opened this run: its key, status, open/expiry times, and how it was decided" },
      { name: "refusals[]", note: "everything dogwatch declined to do, and the exact reason code" },
    ],
  },
  {
    title: "Cost",
    fields: [
      { name: "cost", note: "integer micro-USD, its certainty, and a breakdown that must sum to the total" },
      { name: "llm", note: "call count, model, token counts — calls:0 on a quiet night, always" },
      { name: "degraded[]", note: "any component that fell back to a safer, cheaper mode this run, and why" },
    ],
  },
  {
    title: "Integrity",
    fields: [
      { name: "audit", note: "the sluice event log backing every action and gate — namespace, store, sequence range, and whether it verified" },
      { name: "chain", note: "this record's own hash, and the previous run's, so a retro-edit to any past record breaks every later one visibly" },
      { name: "amendments[]", note: "post-publication facts (a gate decided hours later) — appended, never rewriting what was already published" },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="flex flex-col gap-10 text-ink">
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Documentation</h1>
        <p className="max-w-prose text-sm text-ink-muted">
          What dogwatch is, how to read what it publishes, and where it can fail. Written for someone
          who has never seen this project before.
        </p>
        <nav aria-label="On this page" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a href="#what-this-is" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">What this is</a>
          <a href="#reading-a-record" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">Reading a record</a>
          <a href="#gate-flow" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">The gate flow</a>
          <a href="#rubric" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">The honesty rubric</a>
          <a href="#cost" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">Cost accounting</a>
          <a href="#failure-modes" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">Failure modes</a>
          <a href="#limitations" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">Limitations</a>
        </nav>
      </div>

      <section id="what-this-is" className="flex scroll-mt-6 flex-col gap-3 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold">What this is, and what it is not</h2>
        <p className="max-w-prose text-sm">
          dogwatch is an <strong>operated instance</strong>, not a product you install. It is one
          program watching six specific surfaces I run — five showcase sites and the portfolio hub —
          and publishing what it finds. There is nothing here to sign up for and nothing to configure
          for your own domain. Nothing is published to npm, and forking this repo to point it at your
          own surfaces is unsupported: the code is public (MIT) so you can read exactly how it decided
          what to publish, not so you can run your own copy of it.
        </p>
        <p className="max-w-prose text-sm">
          It does not watch anyone else&apos;s software, does not generate content, and makes no uptime
          claim. One request, one runner, one region, once a night — a quiet night publishes that it
          was quiet, with the checks it ran to reach that conclusion.
        </p>
      </section>

      <section id="reading-a-record" className="flex scroll-mt-6 flex-col gap-4 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold">How to read a run record, field by field</h2>
        <p className="max-w-prose text-sm">
          Every published run is one JSON file at{" "}
          <code className="font-mono text-xs">runs/&lt;YYYY&gt;/&lt;YYYY-MM-DD&gt;-&lt;runId&gt;.json</code>, canonical
          (sorted keys, 2-space indent, a trailing newline), validated against the schema published at{" "}
          <a
            href="https://github.com/jamessuuu/dogwatch/blob/main/schemas/run-record.v1.json"
            className="underline decoration-rule underline-offset-2 hover:decoration-ink"
          >
            schemas/run-record.v1.json
          </a>
          . These are the fields, grouped by what they&apos;re for:
        </p>
        {FIELD_GROUPS.map((g) => (
          <div key={g.title} className="flex flex-col gap-1">
            <h3 className="font-mono text-xs uppercase tracking-wide text-ink-muted">{g.title}</h3>
            <dl className="flex flex-col divide-y divide-rule border-y border-rule">
              {g.fields.map((f) => (
                <div key={f.name} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:gap-4">
                  <dt className="w-52 shrink-0 font-mono text-xs text-ink">{f.name}</dt>
                  <dd className="flex-1 text-sm text-ink-muted">{f.note}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <p className="text-sm">
          <Link href="/runs" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">
            Open a real run and follow along →
          </Link>
        </p>
      </section>

      <section id="gate-flow" className="flex scroll-mt-6 flex-col gap-4 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold">The gate flow, and the three decision channels</h2>
        <p className="max-w-prose text-sm">
          A confirmed finding proposes an action — currently, opening an issue. Opening the gate starts
          a 48-hour timer and notifies two places: always, an issue in dogwatch&apos;s own repo (no
          token needed to read it); optionally, a webhook carrying a single-use tokenized link.
        </p>
        <p className="max-w-prose text-sm">A human decides through exactly one of three channels, every one of them recorded as such:</p>
        <dl className="flex flex-col divide-y divide-rule border-y border-rule">
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
            <dt className="w-40 shrink-0 font-mono text-sm text-ink">(a) web</dt>
            <dd className="flex-1 text-sm text-ink-muted">
              <code className="font-mono text-xs">POST /api/gate/decide</code> with the single-use HMAC token from the
              notification link. Rate-limited at the edge and by an app-level daily counter.
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
            <dt className="w-40 shrink-0 font-mono text-sm text-ink">(b) mobile / CI</dt>
            <dd className="flex-1 text-sm text-ink-muted">
              A <code className="font-mono text-xs">workflow_dispatch</code> on <code className="font-mono text-xs">resume.yml</code>,
              authenticated by GitHub repo permissions — no token, no Vercel, works from the GitHub mobile app.
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
            <dt className="w-40 shrink-0 font-mono text-sm text-ink">(c) CLI</dt>
            <dd className="flex-1 text-sm text-ink-muted">
              <code className="font-mono text-xs">dogwatch gate decide</code> run locally — break-glass, and recorded as
              exactly that.
            </dd>
          </div>
        </dl>
        <p className="max-w-prose text-sm">
          Approval executes the action exactly once, through the same idempotent effect runner every
          probe uses. Rejection refuses it. So does silence: 48 hours with no decision times out, and
          the timeout&apos;s own default is <strong>reject</strong> — fail closed. No auto-approve exists
          anywhere in this product.
        </p>
        <div className="w-full overflow-x-auto border border-rule">
          <img
            src="/diagram/gate-flow.svg"
            width={1140}
            height={460}
            alt="Flow diagram of the dogwatch gate: propose, gate opened, decide through one of three channels, execute exactly once. The 48-hour timeout path into REFUSED is drawn in amber, the only edge that fires without a human."
            className="block w-full min-w-[700px]"
          />
        </div>
      </section>

      <section id="rubric" className="flex scroll-mt-6 flex-col gap-4 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold">The honesty rubric, in prose</h2>
        <p className="max-w-prose text-sm">
          <code className="font-mono text-xs">dogwatch verify</code> runs against every committed
          record on every push. Each rule below has one job and one exact error code — a violation
          that only warns still fails the build.
        </p>
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {RUBRIC.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
              <span className="w-14 shrink-0 font-mono text-sm font-semibold">{r.id}</span>
              <span className="flex-1 text-sm text-ink-muted">Prevents {r.prevents}.</span>
              <span className="shrink-0 font-mono text-xs text-ink-muted">{r.code}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm">
          <Link href="/methodology" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">
            The anti-manufacture rule (R13) and the advisory model, explained further →
          </Link>
        </p>
      </section>

      <section id="cost" className="flex scroll-mt-6 flex-col gap-3 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold">Cost accounting, and why micro-dollars</h2>
        <p className="max-w-prose text-sm">
          Every published <code className="font-mono text-xs">cost.microUsd</code> is an integer,
          computed from provider-reported token usage multiplied by a pricing manifest committed at{" "}
          <code className="font-mono text-xs">pricing.&lt;date&gt;.json</code> — never a hardcoded
          constant. It is rendered at four decimal places of a dollar, not two: rounding a $0.0055 run
          to &quot;$0.01&quot; overstates it by two times, and this project&apos;s whole argument is that
          a number should mean exactly what it says.
        </p>
        <p className="max-w-prose text-sm">
          A quiet night makes no model call at all and costs exactly <code className="font-mono text-xs">$0.0000</code>,
          published as <code className="font-mono text-xs">llm: {"{"} calls: 0, reason: &quot;no_findings&quot; {"}"}</code>.
          On an eventful night, one advisory model call reads only structured evidence already in the
          record — never a page body — and is capped at 2 calls per run and a daily ceiling of 20
          calls, checked before every call. A trip, an API error, or a schema-invalid response degrades
          to the deterministic summary standing alone, published as{" "}
          <code className="font-mono text-xs">degraded: [{"{"}component: &quot;llm&quot;, reason: ...{"}"}]</code>, never
          a silent failure.
        </p>
      </section>

      <section id="failure-modes" className="flex scroll-mt-6 flex-col gap-4 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold">Failure modes</h2>
        <p className="max-w-prose text-sm">The ugly paths this product has an explicit, published contract for — not a hope that they don&apos;t happen.</p>
        <dl className="flex flex-col divide-y divide-rule border-y border-rule">
          {FAILURE_MODES.map((f) => (
            <div key={f.situation} className="flex flex-col gap-1 py-3">
              <dt className="text-sm font-semibold text-ink">{f.situation}</dt>
              <dd className="text-sm text-ink-muted">{f.contract}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="limitations" className="flex scroll-mt-6 flex-col gap-3 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold">Limitations</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <li>This is an operated instance, not a product you install. Nothing here is published to npm; forking and pointing it at your own surfaces is unsupported.</li>
          <li>dogwatch watches six surfaces I operate and makes no claim about anyone else&apos;s software.</li>
          <li>One request, one runner, one region, once a night — this is not an uptime claim. There is no SLA, no paging, and no synthetic performance score.</li>
          <li>Timings and download counts are metrics: recorded and rendered, never judged, never a finding.</li>
          <li><code className="font-mono text-xs">artifact</code>, <code className="font-mono text-xs">repo</code>, and <code className="font-mono text-xs">pkg</code> are registered check families that aren&apos;t implemented yet — see <Link href="/checks" className="underline decoration-rule underline-offset-2 hover:decoration-ink">the check catalog</Link> for the exact reason each is missing.</li>
        </ul>
      </section>
    </div>
  );
}
