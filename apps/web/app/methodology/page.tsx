import type { Metadata } from "next";
import Link from "next/link";
import { listViolationFixtureNames } from "../../lib/data";
import { DisclosureMark, FlagMark } from "../../components/Marks";

export const metadata: Metadata = { title: "Methodology" };

/**
 * The rubric, and the planted record that proves each rule fires.
 *
 * `fixtures/violations/` has always held one deliberately-broken record per
 * rule, asserted against its exact error code by the eval suite — and the
 * site listed the rules and the fixtures in different places, connected by
 * nothing. A rule you can watch catch a real violation in your own browser
 * is a different claim from a rule in a table.
 *
 * Every `fixtures` entry below is checked against the committed directory at
 * BUILD time (see `assertFixturesExist`), so this page cannot link a fixture
 * that does not exist, and cannot silently stop covering one that does.
 */
const RUBRIC: { id: string; catches: string; code: string; fixtures: string[] }[] = [
  {
    id: "R1",
    catches: "checks[] is empty, or a check is stuck at a non-terminal verdict",
    code: "E_NO_CHECKS / E_CHECK_NONTERMINAL",
    fixtures: ["r01-no-checks", "r01b-check-nonterminal"],
  },
  {
    id: "R2 / R3",
    catches:
      "a finding pointing at a check that isn't a finding, or a finding-verdict check with no finding for it",
    code: "E_ORPHAN_FINDING / E_UNREPORTED_CHECK",
    fixtures: ["r02-orphan-finding", "r03-unreported-check"],
  },
  {
    id: "R4",
    catches:
      "a finding without a real source: an absolute https URL, a retrieval timestamp inside the run window, and an evidence path that resolves inside the same record",
    code: "E_UNSOURCED_FINDING",
    fixtures: ["r04-unsourced-finding"],
  },
  {
    id: "R5",
    catches: "an empty-findings run whose absence-of-evidence section doesn't match the actual pass count",
    code: "E_NO_ABSENCE_SECTION",
    fixtures: ["r05-no-absence-section"],
  },
  {
    id: "R6",
    catches: "a skipped or errored check with no machine-readable reason, or missing from notChecked",
    code: "E_SILENT_SKIP",
    fixtures: ["r06-silent-skip"],
  },
  {
    id: "R7 / R8",
    catches: "an action or gate not backed by a real, matching audit event",
    code: "E_ACTION_UNBACKED / E_GATE_UNBACKED",
    fixtures: ["r07-action-unbacked", "r08-gate-unbacked"],
  },
  {
    id: "R9",
    catches:
      "a cost that doesn't sum to its own breakdown, or LLM usage claimed with no provider-reported tokens behind it",
    code: "E_COST_UNBACKED",
    fixtures: ["r09-cost-unbacked"],
  },
  {
    id: "R10",
    catches:
      "an advisory note published with no model call behind it, or citing a finding id or URL that isn't in this record's own evidence",
    code: "E_ADVISORY_UNGROUNDED",
    fixtures: ["r10-advisory-ungrounded"],
  },
  {
    id: "R11",
    catches:
      "a broken or unverified audit hash chain, or a discontinuity from the previous run with no gap record explaining it",
    code: "E_CHAIN_BROKEN",
    fixtures: ["r11-chain-broken"],
  },
  {
    id: "R12",
    catches: "a record whose content no longer matches the hash committed alongside it — the tamper-evidence check",
    code: "E_RECORD_TAMPERED",
    fixtures: ["r12-record-tampered"],
  },
  {
    id: "R13",
    catches: "a finding statement that wasn't re-derived byte-for-byte from stored evidence by the rule that owns it",
    code: "E_MANUFACTURED_FINDING",
    fixtures: ["r13-manufactured-finding"],
  },
  {
    id: "R14",
    catches: "a metric wearing a severity, or sharing an id with a check or finding",
    code: "E_METRIC_AS_FINDING",
    fixtures: ["r14-metric-as-finding"],
  },
  {
    id: "R15",
    catches: "a secret-shaped string, or a header outside the published allowlist, anywhere in a record",
    code: "E_SECRET_LEAK",
    fixtures: ["r15-secret-leak"],
  },
];

/** Fails the BUILD if this page's fixture links and the committed fixtures
 * disagree in either direction — a dead link, or a planted fixture this page
 * has quietly stopped covering. Same principle as schema:check and
 * render:check: the page cannot outpace the artifacts. */
function assertFixturesExist(): string[] {
  const committed = new Set(listViolationFixtureNames());
  const linked = RUBRIC.flatMap((r) => r.fixtures);
  const missing = linked.filter((f) => !committed.has(f));
  if (missing.length > 0) {
    throw new Error(`methodology: links a fixture that does not exist: ${missing.join(", ")}`);
  }
  const uncovered = [...committed].filter((f) => !linked.includes(f));
  if (uncovered.length > 0) {
    throw new Error(`methodology: committed fixtures not covered by the rubric table: ${uncovered.join(", ")}`);
  }
  return linked;
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="panel group px-5 py-4 sm:px-6">
      <summary className="control -mx-2 flex min-h-11 cursor-pointer list-none items-center gap-3 px-2 text-base font-semibold text-ink marker:content-none">
        <DisclosureMark className="text-ink-muted transition-transform group-open:rotate-90" />
        {title}
      </summary>
      <div className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">{children}</div>
    </details>
  );
}

export default function MethodologyPage() {
  const linked = assertFixturesExist();
  // Row count is not rule count: R2/R3 and R7/R8 each share a row, so the
  // 13 rows below cover 15 rules. Counting rows would have published "13
  // rules" for a rubric every other page calls R1-R15.
  const ruleCount = RUBRIC.flatMap((r) => r.id.split("/")).length;

  return (
    <div className="flex flex-col gap-14 text-ink">
      <header className="ambient flex flex-col gap-5">
        <p className="font-mono text-xs tracking-[0.14em] text-ink-muted uppercase">
          how a statement earns the right to be published
        </p>
        <h1 className="max-w-[20ch] text-[2.4rem] leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-5xl">
          <span className="font-mono tabular-nums">{ruleCount}</span> rules.{" "}
          <span className="font-mono tabular-nums">{linked.length}</span> planted records.{" "}
          <span className="font-mono tabular-nums text-amber">0</span> taken on faith.
        </h1>
        <p className="max-w-prose text-[0.95rem] leading-relaxed text-ink-muted">
          <code className="font-mono text-xs">dogwatch verify</code> runs on every committed record on every push. A
          violation that merely warns fails the build. Each rule below has a deliberately-broken record behind it —
          open one and press <span className="text-ink">Verify</span> to watch the checker catch it in your own
          browser.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">The honesty rubric</h2>
          <p className="font-mono text-xs text-ink-muted">
            schema generated from the same Zod source the runner uses
          </p>
        </div>

        <div className="panel divide-y divide-rule px-5 py-1 sm:px-6">
          {RUBRIC.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 py-4 lg:flex-row lg:items-baseline lg:gap-5">
              <span className="w-16 shrink-0 font-mono text-sm font-semibold text-ink">{r.id}</span>
              <p className="flex-1 text-sm leading-relaxed text-ink-muted">{r.catches}</p>
              <div className="flex shrink-0 flex-col items-start gap-1.5 lg:w-72 lg:items-end">
                <span className="well px-2 py-1 text-right font-mono text-[11px] leading-relaxed break-words text-ink-muted">
                  {r.code}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {r.fixtures.map((f) => (
                    <Link
                      key={f}
                      href={`/fixtures/${f}`}
                      className="control inline-flex min-h-11 items-center gap-1.5 rounded-[5px] px-2 py-1 font-mono text-[11px] text-amber hover:bg-well"
                    >
                      <FlagMark />
                      {f.replace(/^r\d+b?-/, "")}
                    </Link>
                  ))}
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
          Those {linked.length} records are committed under{" "}
          <a
            href="https://github.com/jamessuuu/dogwatch/tree/main/fixtures/violations"
            className="text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
          >
            fixtures/violations/
          </a>{" "}
          and asserted against their exact error codes by the eval suite. They are planted failures, not published
          runs, and are marked <code className="font-mono text-xs">noindex</code> accordingly.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What the rules are protecting</h2>
        <div className="flex flex-col gap-3">
          <Note title="R13: a finding is never written, only derived">
            A finding&apos;s statement is the return value of that rule&apos;s own template function, applied to
            recorded evidence — never written by a human or a model. R13 re-derives every finding from scratch,
            offline, over the stored evidence, and requires the result to match the published statement
            byte-for-byte. There is no other code path in the type system that can produce a{" "}
            <code className="font-mono text-xs">Finding</code>.
          </Note>

          <Note title="The advisory model, and why its opinion cannot change anything">
            On a night with findings, one advisory call (Haiku 4.5, forced tool schema, Zod-validated on the way
            back) reads the structured evidence already in the record — never a page body — and returns a severity,
            a note, and a proposed action. That action is published and ignored: the deterministic rule table
            already decided. When the model disagrees with the rule, the record publishes both plus{" "}
            <code className="font-mono text-xs">agreesWithRule: false</code>, so the disagreement rate is an
            artifact rather than a reassurance. A quiet night makes no call at all.
          </Note>

          <Note title="The autonomy ladder, and the one thing deliberately left ungated">
            <strong className="text-ink">L2, automatic:</strong> everything inside this repo — publishing the
            record, committing artifacts, opening and closing dogwatch&apos;s own gate issues.{" "}
            <strong className="text-ink">L3, human gate:</strong> every write to a repo dogwatch does not own.
            Publishing the record itself is deliberately ungated: withholding a run behind an approval would make
            the watch only as live as an inbox, and would defeat the one promise this product makes.
          </Note>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What this is not</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "An installable product. Nothing here is published to npm; forking it and pointing it at your own surfaces is unsupported.",
            "A claim about anyone else's software. dogwatch watches six surfaces James operates, and refuses to probe the rest.",
            "An uptime monitor. One request, one runner, one region, once a night — no SLA, no paging, no synthetic score.",
            "A performance judgement. Timings and download counts are recorded and rendered, never judged, never a finding.",
          ].map((t) => (
            <li key={t} className="panel px-5 py-4 text-sm leading-relaxed text-ink-muted">
              {t}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
