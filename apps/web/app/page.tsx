import Link from "next/link";
import { AutonomyStatus } from "../components/AutonomyStatus";
import { ChainStrip } from "../components/ChainStrip";
import { DeadManBanner } from "../components/DeadManBanner";
import { DemoSection } from "../components/DemoSection";
import { GateFlowSection } from "../components/GateFlowSection";
import { HistoryHero } from "../components/HistoryHero";
import { RecordExcerpt } from "../components/RecordExcerpt";
import { ResponseTrace } from "../components/ResponseTrace";
import { SurfaceLedger } from "../components/SurfaceLedger";
import { nextExpectedIso } from "../lib/dead-man";
import { formatUsd } from "../lib/format";
import { loadLatestRun, loadRunWithFindings, hasScheduledRun, pickRepresentativeChecks } from "../lib/data";
import { loadHistory, loadSurfaces } from "../lib/history";

export default function HomePage() {
  const latest = loadLatestRun();
  const excerptRun = loadRunWithFindings();
  const history = loadHistory();
  const surfaces = loadSurfaces();

  // Checks that actually ran last night against the one live surface —
  // read from the record, not assumed from the total.
  const liveChecks =
    latest === null ? 0 : latest.record.checks.filter((c) => c.verdict !== "skipped").length;

  return (
    <div className="flex flex-col gap-16 sm:gap-20">
      {latest !== null && (
        <DeadManBanner lastRunAt={latest.record.endedAt} nextExpectedAt={nextExpectedIso(latest.record.endedAt)} />
      )}

      <HistoryHero history={history} />

      {excerptRun !== null && (
        <RecordExcerpt
          record={excerptRun.record}
          checks={pickRepresentativeChecks(excerptRun.record)}
          isLatest={latest !== null && excerptRun.record.runId === latest.record.runId}
        />
      )}

      <ChainStrip history={history} />

      <SurfaceLedger surfaces={surfaces} history={history} liveChecks={liveChecks} />

      <ResponseTrace history={history} />

      {/* The cost line, and why it is zero. A $0.0000 with no explanation
          reads as an unimplemented meter; the reason is the interesting
          part and it is recorded in every night's own `llm` block. */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {formatUsd(history.totalCostMicroUsd)} spent across {history.nightCount} nights
          </h2>
          <p className="max-w-prose text-[0.95rem] leading-relaxed text-ink-muted">
            Not because the meter is a stub. The advisory model is wired, capped, schema-forced and
            Zod-validated — and it has never once been reached.
          </p>
        </div>
        <div className="panel grid gap-px overflow-hidden bg-rule sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 bg-raised p-5 sm:p-6">
            <span className="font-mono text-3xl leading-none font-semibold tabular-nums text-ink">
              {history.totalLlmCalls}
            </span>
            <span className="text-sm text-ink-muted">live model calls, all time</span>
          </div>
          <div className="flex flex-col gap-1.5 bg-raised p-5 sm:p-6">
            <span className="font-mono text-3xl leading-none font-semibold tabular-nums text-ink">
              {formatUsd(history.totalCostMicroUsd)}
            </span>
            <span className="text-sm text-ink-muted">
              billed, to four decimals — rounding $0.0055 to a cent would overstate it twofold
            </span>
          </div>
          <div className="flex flex-col gap-1.5 bg-raised p-5 sm:p-6">
            <span className="font-mono text-3xl leading-none font-semibold tabular-nums text-amber">
              {history.nights.filter((n) => n.llmCalls === 0).length}
            </span>
            <span className="text-sm text-ink-muted">
              nights that published <code className="font-mono text-xs">degraded: llm</code> rather than pretend
            </span>
          </div>
        </div>
        <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
          Every record carries its own <code className="font-mono text-xs">llm</code> block with{" "}
          <code className="font-mono text-xs">calls: 0</code> and the reason. The issue-drafting half of that
          model is fully built and provably unreachable —{" "}
          <code className="font-mono text-xs">src/llm/unreachable.test.ts</code> fails the build if any code path
          could reach it. Real gate notifications use a deterministic template instead.
        </p>
      </section>

      <GateFlowSection />

      <AutonomyStatus hasScheduledRun={hasScheduledRun()} />

      <DemoSection />

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-rule pt-6 text-sm">
        <Link href="/runs" className="inline-flex min-h-11 items-center text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink">
          All runs
        </Link>
        <Link href="/checks" className="inline-flex min-h-11 items-center text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink">
          The check catalog
        </Link>
        <Link href="/methodology" className="inline-flex min-h-11 items-center text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink">
          Methodology &amp; limitations
        </Link>
        <Link href="/docs" className="inline-flex min-h-11 items-center text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink">
          Documentation
        </Link>
        <a
          href="https://github.com/jamessuuu/dogwatch"
          className="inline-flex min-h-11 items-center text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
        >
          Source
        </a>
      </div>
    </div>
  );
}
