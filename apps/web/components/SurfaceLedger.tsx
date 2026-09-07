import type { History, Surface } from "../lib/history";

/**
 * The six surfaces, and the reason five of them are skipped.
 *
 * This is the most interesting thing in the repo and it was nowhere on the
 * site. The five undeployed projects share the `*.vercel.app` namespace,
 * and every one of those bare subdomains ALREADY resolves to an unrelated
 * third party's project (verified live 2026-08-08, recorded in each
 * target's own `note` in targets.json). A watch that probed them and
 * interpreted the response would publish findings about a stranger's
 * software as if they were James's.
 *
 * So dogwatch does not probe them at all. The skip is decided by config,
 * BEFORE any HTTP request is made, and the record says `reasonCode:
 * "not_published"` rather than inventing a verdict from a 200 it has no
 * right to interpret. Refusing to look is the correct behaviour and it is
 * worth showing, because "we checked six sites" would have been the easy,
 * wrong, unfalsifiable claim.
 */

function Row({ surface, checks }: { surface: Surface; checks: number }) {
  const live = surface.deployed;
  return (
    <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-baseline sm:gap-5">
      <div className="flex w-full shrink-0 items-center gap-2.5 sm:w-52">
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${live ? "bg-pass" : "bg-sunk"}`}
          aria-hidden="true"
        />
        <span className="font-mono text-sm font-semibold text-ink">{surface.name}</span>
        <span
          className={`ml-auto px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase sm:ml-0 ${
            live ? "bg-pass-wash text-pass" : "bg-well text-ink-muted"
          }`}
          style={{ borderRadius: "4px" }}
        >
          {live ? "watched" : "not probed"}
        </span>
      </div>
      <div className="flex-1">
        <p className="font-mono text-xs break-all text-ink-muted">{surface.url}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          {live ? (
            <>
              {checks} checks ran against it last night across {surface.families.length} families.
            </>
          ) : (
            <>
              Skipped by config before any request. This bare subdomain resolves to an unrelated third party&rsquo;s
              project, so probing it could publish a claim about someone else&rsquo;s software.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export function SurfaceLedger({
  surfaces,
  history,
  liveChecks,
}: {
  surfaces: Surface[];
  history: History;
  liveChecks: number;
}) {
  const liveCount = surfaces.filter((s) => s.deployed).length;
  const latest = history.latest;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Six surfaces. {liveCount} probed. The other {surfaces.length - liveCount} refused, on purpose.
        </h2>
        <p className="max-w-prose text-[0.95rem] leading-relaxed text-ink-muted">
          Every skipped check names its reason in the record. Last night{" "}
          <span className="font-mono text-ink">{latest.notChecked}</span> checks were declared not-run with{" "}
          <code className="font-mono text-xs">reasonCode: &quot;not_published&quot;</code> — a decision made from
          config, never from interpreting a response.
        </p>
      </div>

      <div className="panel divide-y divide-rule px-5 py-1 sm:px-7">
        {surfaces.map((s) => (
          <Row key={s.id} surface={s} checks={s.deployed ? liveChecks : 0} />
        ))}
      </div>
    </section>
  );
}
