import type { History } from "../lib/history";

/**
 * The one metric dogwatch records but deliberately does NOT judge.
 *
 * Every record carries `metrics: [{ name: "response_time_ms", note:
 * "recorded, not judged" }]`. There is no threshold on it, no pass/fail,
 * no alert — because dogwatch has never established what a bad number
 * would be for this surface, and inventing one would be the same
 * unsupported claim its rubric rejects everywhere else. So it is measured,
 * published, and left to the reader. Drawing it here without a threshold
 * line is the honest rendering of that decision.
 */

const VIEW_W = 1000;
const VIEW_H = 120;
const PAD_Y = 12;

export function ResponseTrace({ history }: { history: History }) {
  const stats = history.responseMs;
  if (stats === null) return null;

  const points = history.nights.map((n) => n.responseMs);
  const step = VIEW_W / (points.length - 1);
  // Scaled from zero, not from min: a trace floated on a min-anchored axis
  // turns a 176->1003ms spread into whatever shape the axis chooses.
  const y = (v: number): number => VIEW_H - PAD_Y - (v / stats.max) * (VIEW_H - PAD_Y * 2);

  const coords = points
    .map((v, i) => (v === null ? null : `${String(i * step)},${String(y(v))}`))
    .filter((c): c is string => c !== null);
  const path = `M ${coords.join(" L ")}`;
  // Rough path length for the draw-on animation; over-estimating only
  // makes the reveal start a little earlier, never clips it.
  const traceLen = VIEW_W * 1.6;

  return (
    <div className="panel panel-lift flex flex-col gap-5 p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-ink">
          agentjames response time, {stats.count} nights
        </h2>
        <p className="font-mono text-xs text-ink-muted">recorded, not judged &mdash; no threshold, no alert</p>
      </div>

      <svg
        viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Response time across ${String(stats.count)} nights: minimum ${String(stats.min)} milliseconds, maximum ${String(stats.max)}, mean ${String(stats.mean)}.`}
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1={y(stats.mean)}
          x2={VIEW_W}
          y2={y(stats.mean)}
          stroke="var(--color-rule)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <path
          d={path}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="trace"
          style={{ ["--trace-len" as string]: String(traceLen) }}
        />
        {points.map((v, i) =>
          v === null ? null : (
            <circle
              key={history.nights[i]?.runId ?? String(i)}
              cx={i * step}
              cy={y(v)}
              r="2.5"
              fill={v === stats.max ? "var(--color-amber)" : "var(--color-ink)"}
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
      </svg>

      <dl className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs text-ink-muted">
        <div className="flex gap-2">
          <dt>min</dt>
          <dd className="tabular-nums text-ink">{stats.min} ms</dd>
        </div>
        <div className="flex gap-2">
          <dt>mean</dt>
          <dd className="tabular-nums text-ink">{stats.mean} ms</dd>
        </div>
        <div className="flex gap-2">
          <dt>max</dt>
          <dd className="tabular-nums text-amber">{stats.max} ms</dd>
        </div>
      </dl>
    </div>
  );
}
