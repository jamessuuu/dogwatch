"use client";

import { useEffect, useState } from "react";
import { computeDeadManStatus } from "../lib/dead-man";

interface DeadManBannerProps {
  lastRunAt: string;
  nextExpectedAt: string;
}

/**
 * SPEC §10: "client-side arithmetic — no function, no network." The initial
 * server-rendered pass shows nothing computed (any `Date.now()` baked in at
 * build time would already be stale by the time a visitor loads the page)
 * — the real comparison happens in `useEffect`, after mount, using the
 * browser's own clock. `<noscript>` always prints both timestamps, so a
 * JS-disabled visitor still gets the raw facts even without the arithmetic.
 */
export function DeadManBanner({ lastRunAt, nextExpectedAt }: DeadManBannerProps) {
  const [isLate, setIsLate] = useState<boolean | null>(null);

  useEffect(() => {
    setIsLate(computeDeadManStatus(nextExpectedAt, Date.now()).isLate);
  }, [nextExpectedAt]);

  return (
    <div>
      {isLate === true ? (
        <p className="border border-amber bg-amber/10 px-4 py-3 text-sm text-ink" role="status">
          This watch may have stopped — last run was{" "}
          <time dateTime={lastRunAt}>{formatDate(lastRunAt)}</time>.
        </p>
      ) : isLate === false ? (
        <p className="text-sm text-ink-muted">
          Last run <time dateTime={lastRunAt}>{formatDate(lastRunAt)}</time>. Next expected{" "}
          <time dateTime={nextExpectedAt}>{formatDate(nextExpectedAt)}</time>.
        </p>
      ) : null}
      <noscript>
        <p className="text-sm text-ink-muted">
          Last run: {lastRunAt}. Next expected: {nextExpectedAt}.
        </p>
      </noscript>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}
