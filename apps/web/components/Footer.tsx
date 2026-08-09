/**
 * On every page (SPEC §13 acceptance): chip mark + attribution + the
 * agentjames backlink + the repo link. Deliberately no hire-me CTA (D1) —
 * this is a receipt, not a pitch.
 */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-rule">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {/* next/image's optimizer is a function; this site ships zero route handlers (SPEC §10) — a plain <img> is deliberate, not an oversight */}
          <img src="/brand/mark-16.svg" alt="" width={16} height={16} className="shrink-0" />
          <span>
            Built by{" "}
            <a href="https://agentjames.vercel.app" className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink">
              James Lorenz Santos
            </a>
          </span>
        </div>
        <a
          href="https://github.com/jamessuuu/dogwatch"
          className="font-mono text-xs text-ink-muted underline decoration-rule underline-offset-2 hover:text-ink hover:decoration-ink"
        >
          github.com/jamessuuu/dogwatch
        </a>
      </div>
    </footer>
  );
}
