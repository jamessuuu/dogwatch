import { Attribution } from "./Attribution";

/**
 * On every page (SPEC §13 acceptance): chip mark + attribution + the
 * agentjames backlink + the repo link. Deliberately no hire-me CTA (D1) —
 * this is a receipt, not a pitch.
 *
 * The maker line is the shared attribution kit (attribution-kit v1): the chip mark
 * inline in currentColor (no image request, no route handler), the
 * portfolio and LinkedIn links with rel="me".
 */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-rule">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Attribution linkClassName="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink" />
        <a
          href="https://github.com/jamessuuu/dogwatch"
          className="inline-flex min-h-11 items-center font-mono text-xs text-ink-muted underline decoration-rule underline-offset-2 hover:text-ink hover:decoration-ink"
        >
          github.com/jamessuuu/dogwatch
        </a>
      </div>
    </footer>
  );
}
