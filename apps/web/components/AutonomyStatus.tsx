/**
 * SPEC §5's autonomy ladder, condensed for the landing page (the full
 * version lives at /methodology), plus the honest scheduling status —
 * computed from the published run index (`hasScheduledRun`), never
 * hand-typed, so this claim cannot silently go stale the way a hardcoded
 * sentence would the moment a real scheduled run lands.
 */
export function AutonomyStatus({ hasScheduledRun }: { hasScheduledRun: boolean }) {
  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-8">
      <h2 className="text-lg font-semibold text-ink">What runs on its own, and what doesn&apos;t yet</h2>
      <dl className="flex flex-col divide-y divide-rule border-y border-rule">
        <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
          <dt className="w-24 shrink-0 font-mono text-sm font-semibold text-ink">L2 · auto</dt>
          <dd className="flex-1 text-sm text-ink-muted">
            Everything inside this repo: publishing the record, committing artifacts, opening and
            closing dogwatch&apos;s own gate issues.
          </dd>
        </div>
        <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
          <dt className="w-24 shrink-0 font-mono text-sm font-semibold text-ink">L3 · human gate</dt>
          <dd className="flex-1 text-sm text-ink-muted">
            Every write to a repo dogwatch does not own. Nothing dogwatch can do touches a system I
            don&apos;t operate.
          </dd>
        </div>
      </dl>
      {hasScheduledRun ? (
        <p className="max-w-prose text-sm text-ink">
          <code className="font-mono text-xs">watch.yml</code> has fired on its own schedule — see{" "}
          <code className="font-mono text-xs">kind: &quot;scheduled&quot;</code> on the runs it produced.
        </p>
      ) : (
        <p className="max-w-prose text-sm text-ink">
          <code className="font-mono text-xs">.github/workflows/watch.yml</code> is committed and has
          never executed — nothing has been scheduled to trigger it yet. Every run published so far was
          a manual <code className="font-mono text-xs">dogwatch watch</code> invocation
          (<code className="font-mono text-xs">kind: &quot;manual&quot;</code>). This page will not say
          &quot;nightly&quot; until a real scheduled run has actually happened.
        </p>
      )}
    </section>
  );
}
