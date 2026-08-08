import Link from "next/link";
import { DeadManBanner } from "../components/DeadManBanner";
import { nextExpectedIso } from "../lib/dead-man";
import { formatUsd } from "../lib/format";
import { loadLatestRun } from "../lib/data";

export default function HomePage() {
  const latest = loadLatestRun();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">dogwatch</h1>
        <p className="max-w-prose text-ink">
          The night watch over the six public surfaces of the Agent James program — five showcase
          sites and the portfolio hub. Every night it checks what it operates, then publishes one
          immutable record: what it checked, what it found (every finding citing recorded
          evidence), what it did, what it refused, and what it cost — to the micro-dollar. A quiet
          night publishes that it was quiet, with the checks it ran.
        </p>
      </div>

      {latest === null ? (
        <p className="text-sm text-ink-muted">No run has been published yet.</p>
      ) : (
        <div className="flex flex-col gap-4 border-t border-rule pt-6">
          <DeadManBanner
            lastRunAt={latest.record.endedAt}
            nextExpectedAt={nextExpectedIso(latest.record.endedAt)}
          />
          <p className="font-mono text-sm text-ink">
            {latest.entry.checksTotal} checks · {latest.entry.findings} findings ·{" "}
            {latest.entry.gatesOpened} gates · {formatUsd(latest.entry.costMicroUsd)}
          </p>
          <Link
            href={`/runs/${latest.record.runId}`}
            className="w-fit text-sm text-ink underline decoration-rule underline-offset-2 hover:decoration-ink"
          >
            View this run →
          </Link>
        </div>
      )}

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
