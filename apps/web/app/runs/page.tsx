import type { Metadata } from "next";
import Link from "next/link";
import { loadRunsNewestFirst } from "../../lib/data";
import { formatDateTime, formatUsd } from "../../lib/format";

export const metadata: Metadata = { title: "Runs" };

export default function RunsIndexPage() {
  const runs = loadRunsNewestFirst();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Runs</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {runs.length} published run{runs.length === 1 ? "" : "s"}, newest first. Records are
          never deleted or rewritten (SPEC Decision 2) — this list is the whole history.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {runs.map((run) => (
          <li key={run.runId}>
            <Link
              href={`/runs/${run.runId}`}
              className="flex flex-col gap-1 py-4 hover:bg-ink/[0.03] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-ink-muted">{formatDateTime(run.startedAt)}</span>
                {run.quiet ? (
                  <span className="border border-rule px-1.5 py-0.5 text-xs text-ink-muted">quiet</span>
                ) : (
                  <span className="border border-amber px-1.5 py-0.5 text-xs text-amber">
                    {run.findings} finding{run.findings === 1 ? "" : "s"}
                  </span>
                )}
                {run.kind === "gap" && (
                  <span className="border border-ink/40 px-1.5 py-0.5 text-xs text-ink-muted">gap</span>
                )}
              </div>
              <span className="font-mono text-xs text-ink-muted">
                {run.checksTotal} checks · {run.gatesOpened} gates · {formatUsd(run.costMicroUsd)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
