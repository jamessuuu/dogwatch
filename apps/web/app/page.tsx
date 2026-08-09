import Link from "next/link";
import { AutonomyStatus } from "../components/AutonomyStatus";
import { DeadManBanner } from "../components/DeadManBanner";
import { DemoSection } from "../components/DemoSection";
import { GateFlowSection } from "../components/GateFlowSection";
import { RecordExcerpt } from "../components/RecordExcerpt";
import { nextExpectedIso } from "../lib/dead-man";
import { formatUsd } from "../lib/format";
import { hasScheduledRun, loadLatestRun, loadRunWithFindings, pickRepresentativeChecks } from "../lib/data";

export default function HomePage() {
  const latest = loadLatestRun();
  const excerptRun = loadRunWithFindings();

  return (
    <div className="flex flex-col gap-8">
      {/* ---- the claim, one sentence ---- */}
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">dogwatch</h1>
        <p className="max-w-prose text-ink">
          dogwatch is the night watch over the six public surfaces of the Agent James program. Every
          night it checks what it operates, then publishes one immutable record: what it checked, what
          it found — every finding citing recorded evidence — what it did, what it refused, and what it
          cost, to the micro-dollar.
        </p>
      </div>

      {/* ---- the proof: the last run's actual line, at size ---- */}
      {latest === null ? (
        <p className="text-sm text-ink-muted">No run has been published yet.</p>
      ) : (
        <div className="flex flex-col gap-4 border-t border-rule pt-6">
          <DeadManBanner lastRunAt={latest.record.endedAt} nextExpectedAt={nextExpectedIso(latest.record.endedAt)} />
          <p className="font-mono text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {latest.entry.checksTotal} checks · {latest.entry.findings} findings · {latest.entry.gatesOpened} gates ·{" "}
            {formatUsd(latest.entry.costMicroUsd)}
          </p>
          <Link
            href={`/runs/${latest.record.runId}`}
            className="w-fit text-sm text-ink underline decoration-rule underline-offset-2 hover:decoration-ink"
          >
            View this run →
          </Link>
        </div>
      )}

      <GateFlowSection />

      <DemoSection />

      {excerptRun !== null && (
        <RecordExcerpt
          record={excerptRun.record}
          checks={pickRepresentativeChecks(excerptRun.record)}
          isLatest={latest !== null && excerptRun.record.runId === latest.record.runId}
        />
      )}

      <AutonomyStatus hasScheduledRun={hasScheduledRun()} />

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-rule pt-6 text-sm">
        <Link href="/runs" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">
          All runs
        </Link>
        <Link href="/checks" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">
          The check catalog
        </Link>
        <Link href="/methodology" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">
          Methodology &amp; limitations
        </Link>
        <Link href="/docs" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">
          Documentation
        </Link>
        <a
          href="https://github.com/jamessuuu/dogwatch"
          className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink"
        >
          Source
        </a>
      </div>
    </div>
  );
}
