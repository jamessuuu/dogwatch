// Shared site-level constants used by both app/layout.tsx (metadata) and
// app/manifest.ts (PWA manifest). Layout.tsx cannot export this itself —
// Next.js App Router only permits a fixed set of named exports from a
// layout/page file, and an extra export like this fails the generated
// route-type check (`.next/types/app/layout.ts`).
export const SITE_DESCRIPTION =
  "The night watch over the six public surfaces of the Agent James program. Every night: what it checked, what it found, what it did, what it refused, and what it cost — published as one immutable record.";
