import Link from "next/link";
import type { History } from "../lib/history";
import { NightChart } from "./NightChart";
import { formatUsd } from "../lib/format";

/**
 * The hero is the history, not a description of it.
 *
 * Shape borrowed from the one page in this portfolio that already works
 * (shipgauge): the finding IS the page — a headline stating the result,
 * provenance chips naming exactly what produced it, then the measured
 * series. Every number below is read from `loadHistory()` at build time;
 * none is typed into this file, so none can go stale the way a hand-
 * written "25 nights" would the moment night 26 lands.
 */

function Stat({ value, label, tone = "ink" }: { value: string; label: string; tone?: "ink" | "amber" }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={`font-mono text-2xl leading-none font-semibold tabular-nums tracking-tight sm:text-3xl ${
          tone === "amber" ? "text-amber" : "text-ink"
        }`}
      >
        {value}
      </span>
      <span className="text-xs leading-tight text-ink-muted">{label}</span>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="well px-2.5 py-1 font-mono text-[11px] whitespace-nowrap text-ink-muted">{children}</span>
  );
}

export function HistoryHero({ history }: { history: History }) {
  const nf = new Intl.NumberFormat("en-US");
  const latest = history.latest;

  return (
    <section className="ambient flex flex-col gap-8">
      <div className="rise flex flex-col gap-5">
        <p className="font-mono text-xs tracking-[0.14em] text-ink-muted uppercase">
          {history.firstDay} &rarr; {history.lastDay} &middot; every record committed, every number below read from
          them
        </p>

        {/* The headline. Display size, tight tracking — the result stated
            as a sentence, in the sans face, with the measured quantities
            in the mono face so the eye separates claim from data. */}
        <h1 className="max-w-[22ch] text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.03em] text-balance text-ink sm:text-6xl">
          <span className="whitespace-nowrap">
            <span className="font-mono tabular-nums">{history.nightCount}</span> nights watched.
          </span>{" "}
          <span className="whitespace-nowrap">
            <span className="font-mono tabular-nums">{nf.format(history.totalChecks)}</span> checks.
          </span>{" "}
          <span className="whitespace-nowrap">
            <span className="font-mono tabular-nums text-amber">{history.distinctFindings}</span> findings.
          </span>{" "}
          <span className="font-mono tabular-nums whitespace-nowrap">{formatUsd(history.totalCostMicroUsd)}.</span>
        </h1>

        <p className="max-w-prose text-[0.95rem] leading-relaxed text-ink-muted">
          dogwatch is the night watch over the six public surfaces of the Agent James program. Every night it
          publishes one immutable record: what it checked, what it found, what it refused, and what it cost.
        </p>
      </div>

      {/* Provenance. What produced the number, named — the chips are the
          reason the headline is checkable rather than assertable. */}
      <div className="rise rise-2 flex flex-wrap gap-2">
        <Chip>{history.spanDays} calendar days</Chip>
        <Chip>
          {history.scheduledCount} scheduled &middot; {history.manualCount} manual
        </Chip>
        <Chip>
          {history.chainLinks}/{history.runCount - 1} hash links verified
        </Chip>
        <Chip>{history.totalLlmCalls} LLM calls</Chip>
        <Chip>{nf.format(history.totalAuditEvents)} audit events</Chip>
        <Chip>{history.totalGates} gates opened</Chip>
      </div>

      <div className="rise rise-3 panel panel-lift flex flex-col gap-6 p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-ink">
            Checks run per night, one column per calendar day
          </h2>
          <p className="font-mono text-xs text-ink-muted">
            peak {nf.format(Math.max(...history.nights.map((n) => n.checks)))} &middot; latest{" "}
            {nf.format(latest.checks)}
          </p>
        </div>

        <NightChart history={history} />

        {/* The gap, stated. A chart that hid this would be the exact
            failure dogwatch's rubric exists to catch. */}
        <p className="max-w-prose border-t border-rule pt-4 text-sm leading-relaxed text-ink-muted">
          The cadence is not unbroken and this page will not say it is.{" "}
          <span className="font-mono text-ink">{history.missingDays.length}</span> nights inside the span published
          nothing — the six from {history.missingDays[0]} were a scheduled workflow failing in seconds on a
          checkout guard, fixed 2026-08-15; {history.missingDays.at(-1)} was a GitHub-side gap. Longest unbroken
          run: <span className="font-mono text-ink">{history.longestStreak}</span> nights.
        </p>
      </div>

      <dl className="rise rise-4 grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">
        <Stat value={nf.format(history.totalPasses)} label="checks passed" />
        <Stat value={nf.format(history.totalSkips)} label="skipped, by config" />
        <Stat value={String(history.distinctFindings)} label="distinct findings" tone="amber" />
        <Stat value={String(history.totalErrors)} label="errors, all time" />
        <Stat value={formatUsd(history.totalCostMicroUsd)} label="total spend" />
        <Stat value={String(history.quietCount)} label="quiet nights" />
      </dl>

      <p className="rise rise-4 text-sm text-ink-muted">
        <Link
          href="/runs"
          className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
        >
          Every run, in full
        </Link>{" "}
        &middot;{" "}
        <Link
          href={`/runs/${latest.runId}`}
          className="text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
        >
          last night&rsquo;s record
        </Link>
      </p>
    </section>
  );
}
