import type { AuditEventRecord, Check, RunRecord } from "../../../packages/dogwatch/dist/index.js";
import { groupChecksByFamily } from "../lib/group-checks";
import { formatDateTime, formatUsd } from "../lib/format";
import { githubBlobUrl } from "../lib/data";
import { VerifyButton } from "./VerifyButton";
import { DisclosureMark } from "./Marks";

function VerdictBadge({ verdict }: { verdict: Check["verdict"] }) {
  const styles: Record<Check["verdict"], string> = {
    pass: "text-ink-muted border-rule",
    finding: "text-amber border-amber",
    error: "text-red-800 border-red-800",
    skipped: "text-ink-muted border-rule",
    pending: "text-red-800 border-red-800",
  };
  return <span className={`shrink-0 border px-1.5 py-0.5 font-mono text-[11px] ${styles[verdict]}`}>{verdict}</span>;
}

function CheckRow({ check }: { check: Check }) {
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={check.verdict} />
        <span className="min-w-0 text-sm break-words text-ink">{check.title}</span>
        <span className="min-w-0 font-mono text-xs break-all text-ink-muted">{check.ruleId}</span>
        {check.skipReason !== undefined && (
          <span className="min-w-0 font-mono text-xs break-all text-ink-muted">skipReason:{check.skipReason}</span>
        )}
        {check.errorCode !== undefined && (
          <span className="min-w-0 font-mono text-xs break-all text-red-800">errorCode:{check.errorCode}</span>
        )}
      </div>
      <code className="w-fit max-w-full overflow-x-auto whitespace-pre bg-ink/[0.04] px-2 py-1 font-mono text-xs text-ink">
        {check.reproduce}
      </code>
    </li>
  );
}

function FamilySection({ family, checks }: { family: string; checks: Check[] }) {
  const passes = checks.filter((c) => c.verdict === "pass");
  const notable = checks.filter((c) => c.verdict !== "pass");
  return (
    <div className="flex flex-col gap-1 border-t border-rule py-4">
      <h3 className="font-mono text-xs uppercase tracking-wide text-ink-muted">{family}</h3>
      {notable.length > 0 && <ul className="divide-y divide-rule">{notable.map((c) => <CheckRow key={c.id} check={c} />)}</ul>}
      {passes.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer py-2 text-sm text-ink-muted marker:content-none">
            <DisclosureMark className="mr-2 text-ink-muted transition-transform group-open:rotate-90" />
            {passes.length} passed (collapsed)
          </summary>
          <ul className="divide-y divide-rule">{passes.map((c) => <CheckRow key={c.id} check={c} />)}</ul>
        </details>
      )}
    </div>
  );
}

function FindingsSection({ record }: { record: RunRecord }) {
  if (record.findings.length === 0) return null;
  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-6">
      <h2 className="text-lg font-semibold text-ink">Findings</h2>
      {record.findings.map((f) => (
        <div key={f.id} className="flex flex-col gap-2 border border-rule p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="border border-amber px-1.5 py-0.5 font-mono text-[11px] text-amber">{f.severity}</span>
            <span className="border border-rule px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">{f.status}</span>
            <span className="min-w-0 font-mono text-xs break-all text-ink-muted">{f.id}</span>
            <span className="min-w-0 font-mono text-xs break-all text-ink-muted">{f.ruleId}</span>
          </div>
          <p className="text-sm text-ink">{f.statement}</p>
          <ul className="flex flex-col gap-1 font-mono text-xs break-all text-ink-muted">
            {f.sources.map((s, i) => (
              <li key={i}>
                {s.method} {s.url} → {s.status} at {s.retrievedAt} ({s.evidencePath})
              </li>
            ))}
          </ul>
          {f.advisory !== undefined && (
            <div className="mt-1 border-l-2 border-amber/50 pl-3 text-sm text-ink">
              <p className="font-mono text-[11px] text-ink-muted">
                advisory ({f.advisory.model}) — severity: {f.advisory.severity}
                {f.advisory.agreesWithRule ? "" : " (disagrees with the rule)"} — proposed:{" "}
                {f.advisory.proposedAction} (displayed, ignored)
              </p>
              <p>{f.advisory.note}</p>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function AbsenceSection({ record }: { record: RunRecord }) {
  const a = record.absenceOfEvidence;
  return (
    <section className="flex flex-col gap-3 border-t border-rule pt-6">
      <h2 className="text-lg font-semibold text-ink">Absence of evidence</h2>
      <p className="text-sm text-ink">{a.statement}</p>
      <p className="font-mono text-xs text-ink-muted">
        {a.checksClean} clean · {Object.entries(a.byFamily).map(([fam, n]) => `${fam}:${String(n)}`).join(" ") || "no per-family breakdown"}
      </p>
      {a.notChecked.length > 0 && (
        <ul className="font-mono text-xs break-all text-ink-muted">
          {a.notChecked.map((n) => (
            <li key={n.checkId}>
              {n.checkId} — {n.reasonCode}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActionsGatesRefusals({ record }: { record: RunRecord }) {
  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-6">
      <h2 className="text-lg font-semibold text-ink">Actions, gates &amp; refusals</h2>
      <div>
        <h3 className="font-mono text-xs uppercase tracking-wide text-ink-muted">Actions</h3>
        {record.actions.length === 0 ? (
          <p className="text-sm text-ink-muted">None this run.</p>
        ) : (
          <ul className="font-mono text-xs text-ink">
            {record.actions.map((a) => (
              <li key={a.id}>
                {a.kind} → {a.target} ({a.status})
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="font-mono text-xs uppercase tracking-wide text-ink-muted">Gates</h3>
        {record.gates.length === 0 ? (
          <p className="text-sm text-ink-muted">None this run.</p>
        ) : (
          <ul className="font-mono text-xs text-ink">
            {record.gates.map((g) => (
              <li key={g.id}>
                {g.key} — {g.status} (opened {g.openedAt})
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="font-mono text-xs uppercase tracking-wide text-ink-muted">Refusals</h3>
        {record.refusals.length === 0 ? (
          <p className="text-sm text-ink-muted">None this run.</p>
        ) : (
          <ul className="font-mono text-xs text-ink">
            {record.refusals.map((r, i) => (
              <li key={i}>
                {r.subject} — {r.reasonCode}: {r.detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CostSection({ record }: { record: RunRecord }) {
  return (
    <section className="flex flex-col gap-3 border-t border-rule pt-6">
      <h2 className="text-lg font-semibold text-ink">Cost</h2>
      <p className="font-mono text-sm text-ink">
        {formatUsd(record.cost.microUsd)} <span className="text-ink-muted">({record.cost.certainty})</span>
      </p>
      <p className="font-mono text-xs text-ink-muted">
        method: {record.cost.method} · breakdown:{" "}
        {Object.entries(record.cost.breakdown).map(([k, v]) => `${k}:${String(v)}µ`).join(" ") || "none"}
      </p>
      <p className="font-mono text-xs text-ink-muted">
        llm: {record.llm.calls} call{record.llm.calls === 1 ? "" : "s"}
        {record.llm.model !== undefined ? ` (${record.llm.model})` : ""} · {record.llm.inputTokens} in /{" "}
        {record.llm.outputTokens} out
        {record.llm.reason !== undefined ? ` · reason: ${record.llm.reason}` : ""}
      </p>
      {record.degraded.length > 0 && (
        <p className="font-mono text-xs text-ink-muted">
          degraded: {record.degraded.map((d) => `${d.component}:${d.reason}`).join(", ")}
        </p>
      )}
    </section>
  );
}

function AuditEventRow({ event }: { event: AuditEventRecord }) {
  return (
    <li className="font-mono text-xs break-all text-ink-muted">
      #{event.seq} {event.type} · {event.subjectType}:{event.subjectKey} · {event.actor} ·{" "}
      {new Date(event.ts).toISOString()}
    </li>
  );
}

function AuditSection({ record }: { record: RunRecord }) {
  return (
    <section className="flex flex-col gap-3 border-t border-rule pt-6">
      <h2 className="text-lg font-semibold text-ink">Audit</h2>
      <p className="font-mono text-xs text-ink-muted">
        namespace: {record.audit.namespace} · store: {record.audit.store} · seq {record.audit.fromSeq}–
        {record.audit.toSeq} · verified: {String(record.audit.verified)}
      </p>
      {record.audit.events.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-ink-muted">{record.audit.events.length} audit events (collapsed)</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {record.audit.events.map((e) => (
              <AuditEventRow key={e.id} event={e} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/**
 * A run's shape before its 121 rows of detail.
 *
 * The page previously opened with the run id and a metadata line, then went
 * straight into the check list — so "what happened on this night" required
 * scrolling the whole record. These six numbers are read off the record
 * itself (never the index, which is a derived file) and answer it at a
 * glance; the detail below is then evidence for them rather than the only
 * way to find them.
 */
function RunSummary({ record }: { record: RunRecord }) {
  const verdicts = { pass: 0, finding: 0, skipped: 0, error: 0 };
  for (const c of record.checks) {
    if (c.verdict === "pass") verdicts.pass += 1;
    else if (c.verdict === "finding") verdicts.finding += 1;
    else if (c.verdict === "skipped") verdicts.skipped += 1;
    else if (c.verdict === "error") verdicts.error += 1;
  }
  const quiet = record.findings.length === 0;

  return (
    <header className="ambient flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs tracking-[0.14em] text-ink-muted uppercase">
          {record.kind} run &middot; commit {record.commit.slice(0, 12)}
        </p>
        <h1 className="font-mono text-2xl font-semibold tracking-tight break-all text-ink sm:text-3xl">
          {record.runId}
        </h1>
        <p className="text-sm text-ink-muted">
          {formatDateTime(record.startedAt)} &rarr; {formatDateTime(record.endedAt)}
        </p>
      </div>

      <div className="panel grid grid-cols-2 gap-px overflow-hidden bg-rule sm:grid-cols-3 lg:grid-cols-6">
        {[
          { v: String(record.checks.length), l: "checks" },
          { v: String(verdicts.pass), l: "passed" },
          { v: String(verdicts.skipped), l: "skipped" },
          {
            v: String(record.findings.length),
            l: record.findings.length === 1 ? "finding" : "findings",
            tone: quiet ? "" : "text-amber",
          },
          { v: String(record.gates.length), l: record.gates.length === 1 ? "gate" : "gates" },
          { v: formatUsd(record.cost.microUsd), l: "cost" },
        ].map((s) => (
          <div key={s.l + s.v} className="flex flex-col gap-1 bg-raised p-4">
            <span className={`font-mono text-xl leading-none font-semibold tabular-nums sm:text-2xl ${s.tone ?? "text-ink"}`}>
              {s.v}
            </span>
            <span className="text-xs text-ink-muted">{s.l}</span>
          </div>
        ))}
      </div>
    </header>
  );
}

export interface RunRecordDetailProps {
  record: RunRecord;
  raw: string;
  /** Repo-relative path to the committed file (e.g. `runs/2026/...json`) —
   * absent for a fixture rendered outside `runs/` (SPEC §11.6's tampered-
   * fixture e2e scenario). */
  relativePath?: string;
}

export function RunRecordDetail({ record, raw, relativePath }: RunRecordDetailProps) {
  return (
    <div className="flex flex-col gap-8">
      <RunSummary record={record} />

      <VerifyButton record={record} />

      <section className="flex flex-col border-t border-rule pt-2">
        <h2 className="pt-4 text-lg font-semibold text-ink">Checks</h2>
        {groupChecksByFamily(record.checks).map((g) => (
          <FamilySection key={g.family} family={g.family} checks={g.checks} />
        ))}
      </section>

      <FindingsSection record={record} />
      <AbsenceSection record={record} />
      <ActionsGatesRefusals record={record} />
      <CostSection record={record} />
      <AuditSection record={record} />

      <section className="flex flex-col gap-3 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold text-ink">Raw</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          {relativePath !== undefined && (
            <a
              href={githubBlobUrl(record.commit, relativePath)}
              className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink"
            >
              View on GitHub (blob @ {record.commit.slice(0, 12)})
            </a>
          )}
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-ink-muted">Raw JSON</summary>
          <pre className="mt-2 max-h-[32rem] overflow-auto bg-ink/[0.04] p-3 font-mono text-xs text-ink">{raw}</pre>
        </details>
      </section>
    </div>
  );
}
