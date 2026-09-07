import type { History, NightPoint } from "../lib/history";

/**
 * The published month, drawn as one column per CALENDAR day — not one
 * column per run.
 *
 * That choice is the whole point. Plotting runs side by side would close
 * the gaps and let the chart imply an unbroken nightly cadence; plotting
 * calendar days leaves the seven nights that published nothing as visible
 * holes. dogwatch's own honesty rubric exists to catch exactly the claim
 * "we ran every night" made over data that says otherwise, so its own
 * landing page may not make that claim by omission.
 *
 * Inline SVG, no charting library, no client JS: this is ~30 rects and a
 * polyline. Nothing here blurs, blends, or filters — measured elsewhere
 * today, a blurred shadow layer cost 58 -> 24fps and `mix-blend-mode:
 * overlay` 60 -> 47.8fps, and a chart is not worth either.
 */

const VIEW_W = 1000;
const VIEW_H = 260;
const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 16;
const PAD_B = 34;

interface Column {
  day: string;
  night: NightPoint | null;
}

function buildColumns(history: History): Column[] {
  const byDay = new Map<string, NightPoint>();
  // Two runs share 2026-08-08 and 2026-08-28; the later (larger) run is the
  // one the day is represented by, and both remain listed on /runs.
  for (const n of history.nights) {
    const existing = byDay.get(n.day);
    if (existing === undefined || Date.parse(n.startedAt) > Date.parse(existing.startedAt)) byDay.set(n.day, n);
  }
  const columns: Column[] = [];
  const start = Date.parse(history.firstDay);
  const end = Date.parse(history.lastDay);
  for (let t = start; t <= end; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    columns.push({ day, night: byDay.get(day) ?? null });
  }
  return columns;
}

export function NightChart({ history }: { history: History }) {
  const columns = buildColumns(history);
  const labelEvery = 5;
  const maxChecks = Math.max(...history.nights.map((n) => n.checks));
  const plotW = VIEW_W - PAD_L - PAD_R;
  const plotH = VIEW_H - PAD_T - PAD_B;
  const colW = plotW / columns.length;
  const barW = Math.max(6, colW * 0.62);

  const y = (checks: number): number => PAD_T + plotH - (checks / maxChecks) * plotH;

  return (
    <figure className="m-0 flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Checks run per night, ${history.firstDay} to ${history.lastDay}. ${String(history.nightCount)} nights published, ${String(history.missingDays.length)} nights published nothing. Coverage grew from ${String(history.first.checks)} checks to ${String(history.latest.checks)}.`}
      >
        {/* Baseline only. No gridlines: four horizontal rules behind 30
            bars is chartjunk, and the numbers are printed beside it. */}
        <line
          x1={PAD_L}
          y1={PAD_T + plotH + 0.5}
          x2={VIEW_W - PAD_R}
          y2={PAD_T + plotH + 0.5}
          stroke="var(--color-rule)"
          strokeWidth="1"
        />

        {columns.map((col, i) => {
          const x = PAD_L + i * colW + (colW - barW) / 2;
          const label = col.day.slice(8);
          const showLabel = i % labelEvery === 0 || i === columns.length - 1;
          if (col.night === null) {
            // A night that published nothing. Drawn as a hollow tick on the
            // baseline — present enough to count, empty enough to read as
            // absence rather than as a very small run.
            return (
              <g key={col.day}>
                <rect
                  x={x}
                  y={PAD_T + plotH - 5}
                  width={barW}
                  height={5}
                  rx="1"
                  fill="none"
                  stroke="var(--color-sunk)"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                {showLabel && (
                  <text
                    x={x + barW / 2}
                    y={VIEW_H - 12}
                    textAnchor="middle"
                    className="fill-ink-muted font-mono"
                    fontSize="13"
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          }
          const n = col.night;
          const top = y(n.checks);
          const h = PAD_T + plotH - top;
          return (
            <g key={col.day}>
              {/* passes, solid; the rest of the bar is skips — the ratio is
                  a real fact about a program with one live surface. */}
              <rect x={x} y={top} width={barW} height={h} rx="2" fill="var(--color-sunk)" />
              <rect
                x={x}
                y={PAD_T + plotH - (n.passes / maxChecks) * plotH}
                width={barW}
                height={(n.passes / maxChecks) * plotH}
                rx="2"
                fill="var(--color-ink)"
              />
              {n.findings > 0 && (
                <circle cx={x + barW / 2} cy={top - 9} r="3.5" fill="var(--color-amber)" />
              )}
              {showLabel && (
                <text
                  x={x + barW / 2}
                  y={VIEW_H - 12}
                  textAnchor="middle"
                  className="fill-ink-muted font-mono"
                  fontSize="13"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-ink" />
          checks that ran
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-sunk" />
          skipped, not published
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber" />
          night with a finding
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2.5 rounded-[1px] border border-dashed border-sunk" />
          published nothing
        </span>
      </figcaption>
    </figure>
  );
}
