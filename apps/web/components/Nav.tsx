import Link from "next/link";

const LINKS: { href: "/" | "/runs" | "/checks" | "/methodology"; label: string }[] = [
  { href: "/runs", label: "Runs" },
  { href: "/checks", label: "Checks" },
  { href: "/methodology", label: "Methodology" },
];

export function Nav() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
          {/* static asset, no image optimizer (SPEC §10 D3) — a plain <img> is deliberate */}
          <img src="/brand/mark.svg" alt="" width={20} height={20} />
          dogwatch
        </Link>
        <nav className="flex gap-5 text-sm text-ink-muted">
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
