import type { Metadata } from "next";
import { checksCatalog } from "../../lib/data";

export const metadata: Metadata = { title: "Checks" };

export default function ChecksPage() {
  const catalog = checksCatalog();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">The check catalog</h1>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          Rendered from the same registry the runner reads (SPEC §12) — this page cannot drift
          from what actually ran, because it is not a description of the code, it is the code.
        </p>
      </div>

      {catalog.map((fam) => (
        <section key={fam.family} className="border-t border-rule pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-mono text-base font-semibold text-ink">{fam.family}</h2>
            {fam.implemented ? (
              <span className="border border-rule px-1.5 py-0.5 text-xs text-ink-muted">implemented</span>
            ) : (
              <span className="border border-amber px-1.5 py-0.5 text-xs text-amber">lands at {fam.landingMilestone}</span>
            )}
          </div>
          {!fam.implemented && fam.reason !== undefined && (
            <p className="mt-2 max-w-prose text-sm text-ink-muted">{fam.reason}</p>
          )}
          <ul className="mt-3 flex flex-col divide-y divide-rule">
            {fam.rules.map((rule) => (
              <li key={rule.ruleId} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="w-fit shrink-0 font-mono text-xs text-ink">{rule.ruleId}</span>
                <span className="text-sm text-ink-muted">{rule.asserts}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
