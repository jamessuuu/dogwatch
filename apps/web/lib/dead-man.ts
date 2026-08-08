/**
 * The dead-man banner's arithmetic (SPEC §10): "client-side arithmetic —
 * no function, no network". Pure, zero I/O — the ONLY code path that
 * decides whether the banner reads as healthy or stopped, so it is unit-
 * tested at its exact boundary (`dead-man.test.ts`) rather than only
 * eyeballed in the browser. The component (`components/DeadManBanner.tsx`)
 * calls this from a `useEffect` after mount, using the browser's own
 * `Date.now()` — never a value baked in at build time, which would be
 * stale the moment a visitor loads the page hours or days later.
 */

const SCHEDULE_INTERVAL_HOURS = 24;
/** SPEC §10: "> 36h late: 'This watch may have stopped...'". */
const LATE_THRESHOLD_HOURS = 36;
const MS_PER_HOUR = 3_600_000;

/** The watch runs once a night (SPEC §5) — the next expected run is simply
 * one schedule interval after the last one, regardless of whether that run
 * was "scheduled" or a manual `workflow_dispatch` (both are real runs). */
export function nextExpectedIso(lastRunAtIso: string): string {
  return new Date(Date.parse(lastRunAtIso) + SCHEDULE_INTERVAL_HOURS * MS_PER_HOUR).toISOString();
}

export interface DeadManStatus {
  /** Hours since `nextExpectedAt` — negative means still in the future
   * (healthy: the next run simply hasn't come due yet). */
  lateHours: number;
  isLate: boolean;
}

export function computeDeadManStatus(nextExpectedAtIso: string, nowMs: number): DeadManStatus {
  const lateHours = (nowMs - Date.parse(nextExpectedAtIso)) / MS_PER_HOUR;
  return { lateHours, isLate: lateHours > LATE_THRESHOLD_HOURS };
}
