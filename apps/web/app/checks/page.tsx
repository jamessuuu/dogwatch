import type { Metadata } from "next";
import { checksCatalog } from "../../lib/data";

export const metadata: Metadata = { title: "Checks" };

export default function ChecksPage() {
  const catalog = checksCatalog();
  const totalRules = catalog.reduce((n, f) => n + f.rules.length, 0);
  const implemented = catalog.filter((f) => f.implemented);
  const implementedRules = implemented.reduce((n, f) => n + f.rules.length, 0);
  const pending = catalog.filter((f) => !f.implemented);

  return (
    <div className="flex flex-col gap-14">
      <header className="ambient flex flex-col gap-5">
        <p className="font-mono text-xs tracking-[0.14em] text-ink-muted uppercase">
          rendered from the registry the runner reads, not a description of it
        </p>
        <h1 className="max-w-[20ch] text-[2.4rem] leading-[1.05] font-semibold tracking-[-0.03em] text-balance text-ink sm:text-5xl">
          <span className="font-mono tabular-nums">{implementedRules}</span> rules that run.{" "}
          <span className="font-mono tabular-nums text-amber">{totalRules - implementedRules}</span> registered and
          honestly not built.
        </h1>
        <p className="max-w-prose text-[0.95rem] leading-relaxed text-ink-muted">
          A family that is registered but unimplemented says so here and skips with a reason in every record, rather
          than being quietly absent. This page cannot drift from what actually ran, because it is not documentation
          of the registry — it is the registry.
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="well px-2.5 py-1 font-mono text-[11px] text-ink-muted">
            {catalog.length} families
          </span>
          <span className="well px-2.5 py-1 font-mono text-[11px] text-ink-muted">
            {implemented.length} implemented
          </span>
          <span className="well px-2.5 py-1 font-mono text-[11px] text-ink-muted">
            {pending.length} awaiting a milestone
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-6">
        {catalog.map((fam) => (
          <section key={fam.family} className="panel panel-lift flex flex-col gap-4 p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="font-mono text-xl font-semibold tracking-tight text-ink">{fam.family}</h2>
              {fam.implemented ? (
                <span className="rounded-[5px] bg-pass-wash px-2 py-0.5 font-mono text-[11px] tracking-wide text-pass uppercase">
                  implemented
                </span>
              ) : (
                <span className="rounded-[5px] bg-well px-2 py-0.5 font-mono text-[11px] tracking-wide text-skip uppercase">
                  lands at {fam.landingMilestone}
                </span>
              )}
              <span className="ml-auto font-mono text-xs text-ink-muted">
                {fam.rules.length} {fam.rules.length === 1 ? "rule" : "rules"}
              </span>
            </div>

            {!fam.implemented && fam.reason !== undefined && (
              <p className="max-w-prose border-l-0 text-sm leading-relaxed text-ink-muted">{fam.reason}</p>
            )}

            <ul className="divide-y divide-rule">
              {fam.rules.map((rule) => (
                <li key={rule.ruleId} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-baseline sm:gap-5">
                  <span className="w-fit shrink-0 font-mono text-xs break-all text-ink sm:w-56">{rule.ruleId}</span>
                  <span className="flex-1 text-sm leading-relaxed text-ink-muted">{rule.asserts}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
