import Link from "next/link";

const LINKS: { href: "/" | "/runs" | "/checks" | "/methodology" | "/docs"; label: string }[] = [
  { href: "/runs", label: "Runs" },
  { href: "/checks", label: "Checks" },
  { href: "/methodology", label: "Methodology" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-5">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
          {/* The PROJECT glyph is the identity in the header, not the chip:
           * BRAND-KIT "Icon hierarchy" (2026-08-09) — the glyph says which
           * tool this is, the chip says who made it and lives in the footer.
           * Plain <img>, no image optimizer, because this app must render
           * with every serverless function paused (SPEC §10 D3). */}
          <img src="/brand/glyph.svg" alt="" width={20} height={20} />
          dogwatch
        </Link>
        {/* flex-wrap (not a hamburger menu — no JS, no hidden content) is
         * what keeps this readable at 320px (DESIGN-DIRECTION accessibility
         * requirement): five links plus the logo don't fit one line at
         * phone width, so the row wraps to a second line instead of
         * overlapping or clipping. */}
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-ink">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
