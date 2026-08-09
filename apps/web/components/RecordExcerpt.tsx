import Link from "next/link";
import type { Check, Finding, RunRecord } from "../../../packages/dogwatch/dist/index.js";
import { formatDateTime } from "../lib/format";

/**
 * DESIGN-DIRECTION.md §5: "a live excerpt of a real published record... IS
 * the product; showing it beats describing it." Every value here is read
 * straight off a committed `RunRecord` — nothing on this page is invented
 * (HARD RULE: findings shown must come from real records, never invented
 * examples — R13's whole point).
 */

function CheckLine({ check }: { check: Check }) {
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 border border-rule px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">pass</span>
        <span className="text-sm text-ink">{check.title}</span>
        <span className="font-mono text-xs text-ink-muted">{check.ruleId}</span>
      </div>
      <code className="w-fit max-w-full overflow-x-auto whitespace-pre bg-ink/[0.04] px-2 py-1 font-mono text-xs text-ink">
        {check.reproduce}
      </code>
    </li>
  );
}

function FindingBlock({ finding }: { finding: Finding }) {
  return (
    <div className="flex flex-col gap-2 border border-rule p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="border border-amber px-1.5 py-0.5 font-mono text-[11px] text-amber">{finding.severity}</span>
        <span className="border border-rule px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">{finding.status}</span>
        <span className="font-mono text-xs text-ink-muted">{finding.id}</span>
        <span className="font-mono text-xs text-ink-muted">{finding.ruleId}</span>
      </div>
      <p className="text-sm text-ink">{finding.statement}</p>
      <ul className="flex flex-col gap-1 font-mono text-xs text-ink-muted">
        {finding.sources.map((s, i) => (
          <li key={i}>
            {s.method} {s.url} → {s.status} at {s.retrievedAt}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface RecordExcerptProps {
  record: RunRecord;
  checks: Check[];
  isLatest: boolean;
}

export function RecordExcerpt({ record, checks, isLatest }: RecordExcerptProps) {
  const finding = record.findings.at(0);
  const a = record.absenceOfEvidence;

  return (
    <section className="flex flex-col gap-5 border-t border-rule pt-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">A real published record, not a description of one</h2>
        <p className="max-w-prose text-sm text-ink">
          Below is a real excerpt of run <code className="font-mono text-xs">{record.runId}</code>
          {isLatest ? " — the latest one" : " — the most recent one with a finding"}, {formatDateTime(record.startedAt)}.
          Nothing on this page is invented; every line here is copied from the committed file.
        </p>
      </div>

      {checks.length > 0 && (
        <div>
          <h3 className="font-mono text-xs uppercase tracking-wide text-ink-muted">Checks (a sample of {record.checks.length})</h3>
          <ul className="divide-y divide-rule border-y border-rule">
            {checks.map((c) => (
              <CheckLine key={c.id} check={c} />
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="font-mono text-xs uppercase tracking-wide text-ink-muted">
          {finding !== undefined ? "A finding, with its source" : "No finding in this record"}
        </h3>
        {finding !== undefined ? (
          <div className="mt-2">
            <FindingBlock finding={finding} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Every published run so far has been quiet.</p>
        )}
      </div>

      <div>
        <h3 className="font-mono text-xs uppercase tracking-wide text-ink-muted">Absence of evidence, verbatim</h3>
        <p className="mt-2 text-sm text-ink">{a.statement}</p>
        <p className="mt-1 font-mono text-xs text-ink-muted">
          {a.checksClean} clean ·{" "}
          {Object.entries(a.byFamily)
            .map(([fam, n]) => `${fam}:${String(n)}`)
            .join(" ") || "no per-family breakdown"}
        </p>
      </div>

      <p className="text-sm">
        <Link href={`/runs/${record.runId}`} className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">
          See the full record, with every check and the Verify button →
        </Link>
      </p>
    </section>
  );
}
