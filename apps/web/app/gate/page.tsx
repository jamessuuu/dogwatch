import type { Metadata } from "next";
import { GateDecideForm } from "../../components/GateDecideForm";
import { findPendingGate } from "../../lib/data";

/**
 * `/gate?id=…[&t=…]` (SPEC §5 step 3 / §10): the only page that POSTs. The
 * gate id comes from either notification channel — the self-repo issue
 * link carries NO token; the optional webhook link carries one. Reads
 * `state/pending-gates.json` directly (committed, tokenless) for the page
 * shell; nothing here queries Postgres.
 */
export const metadata: Metadata = { title: "Decide a gate", robots: { index: false, follow: false } };

// Search-param-driven, not a static param set (SPEC §5's own three decision
// channels all route through the same URL shape with a live gateId) —
// dynamic per request rather than statically generated per known id.
export const dynamic = "force-dynamic";

interface GatePageProps {
  searchParams: Promise<{ id?: string; t?: string }>;
}

export default async function GatePage({ searchParams }: GatePageProps) {
  const { id, t } = await searchParams;

  if (id === undefined || id.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Decide a gate</h1>
        <p className="text-sm text-ink-muted">
          No gate id given. Follow the link from a dogwatch gate-notification issue, or the
          `workflow_dispatch` link on `resume.yml`.
        </p>
      </div>
    );
  }

  const pending = findPendingGate(id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Decide a gate</h1>
        <p className="mt-1 font-mono text-xs text-ink-muted">{id}</p>
      </div>

      {pending === null ? (
        <p className="border border-rule px-4 py-3 text-sm text-ink-muted">
          This gate is not currently pending — it may already have been decided, timed out, or the id
          is wrong. Check <a className="underline decoration-rule underline-offset-2" href="/runs">recent runs</a> for
          its outcome.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-sm text-ink">
            <dt className="text-ink-muted">key</dt>
            <dd>{pending.key}</dd>
            <dt className="text-ink-muted">run</dt>
            <dd>
              <a className="underline decoration-rule underline-offset-2" href={`/runs/${pending.runId}`}>
                {pending.runId}
              </a>
            </dd>
            <dt className="text-ink-muted">expires</dt>
            <dd>{pending.expiresAt}</dd>
          </dl>
          <GateDecideForm gateId={pending.gateId} token={t ?? null} />
        </>
      )}
    </div>
  );
}
