import Link from "next/link";
import type { History } from "../lib/history";

/**
 * The cross-run hash chain, drawn from the hashes themselves.
 *
 * Record N's `chain.prevRecordHash` must equal record N-1's published
 * `recordHash`. `loadHistory()` checks all 24 links at build time rather
 * than asserting them, and the count below is that check's own result — if
 * a record were edited after publication the number would drop and this
 * component would say so.
 *
 * Layout note: an earlier version drew this as one horizontally-scrolling
 * row with connector rules, which looked like a chain and behaved badly —
 * project-gate measured 22 controls clipped at the viewport edge on a
 * phone, i.e. 22 links a thumb could only half reach. The sequence is
 * carried by the genesis -> head line and the verified count; it does not
 * need 25 boxes in a row to say so. A wrapping grid reaches every record at
 * every width with nothing clipped.
 *
 * Every hash rendered here is the real committed value, truncated for
 * width only; the full value is on each run's own page.
 */
export function ChainStrip({ history }: { history: History }) {
  const short = (h: string): string => h.slice(0, 7);
  const intact = history.chainIntact && history.chainLinks === history.runCount - 1;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {history.runCount} records, {history.chainLinks} links, checked not claimed
        </h2>
        <p className="max-w-prose text-[0.95rem] leading-relaxed text-ink-muted">
          Each record commits the hash of the one before it. Editing any published night would break every link
          after it. The count below was recomputed while this page was built.
        </p>
      </div>

      <div className="panel flex flex-col gap-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={`inline-flex items-center gap-2 rounded-[6px] px-2.5 py-1 font-mono text-xs ${
              intact ? "bg-pass-wash text-pass" : "bg-fail-wash text-fail"
            }`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${intact ? "bg-pass" : "bg-fail"}`} />
            {intact ? "chain intact" : "chain broken"}
          </span>
          <span className="font-mono text-xs text-ink-muted">
            {history.chainLinks}/{history.runCount - 1} links verified at build
          </span>
        </div>

        <ol className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
          {history.nights.map((n, i) => (
            <li key={n.runId}>
              <Link
                href={`/runs/${n.runId}`}
                title={`${n.day} — ${n.recordHash}`}
                className="control well flex min-h-11 w-full flex-col justify-center gap-0.5 px-2.5 py-2 hover:bg-sunk"
              >
                <span className="font-mono text-[11px] text-ink">
                  <span className="text-ink-muted">{String(i + 1).padStart(2, "0")}</span> {short(n.recordHash)}
                </span>
                <span className="font-mono text-[10px] text-ink-muted">{n.day}</span>
              </Link>
            </li>
          ))}
        </ol>

        <p className="border-t border-rule pt-4 font-mono text-xs break-all text-ink-muted">
          genesis <span className="text-ink-muted">prevRecordHash: null</span> &rarr; head{" "}
          <span className="text-ink">{history.latest.recordHash}</span>
          <br />
          {history.totalAuditEvents.toLocaleString("en-US")} hash-linked audit events inside them
        </p>
      </div>
    </section>
  );
}
