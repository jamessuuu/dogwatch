import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { Nav } from "../components/Nav";
import { SITE_DESCRIPTION } from "../lib/site";
import "./globals.css";

// The real alias, read from `vercel inspect`, not guessed. The bare
// `dogwatch.vercel.app` subdomain resolves to an UNRELATED third party's
// project — the same squat targets.json documents for the other five
// surfaces — so pointing metadataBase/OG at it published this site's
// canonical identity at someone else's domain. Fixed 2026-09-07.
const SITE_URL = "https://dogwatch-two.vercel.app";
const DESCRIPTION = SITE_DESCRIPTION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "dogwatch", template: "%s — dogwatch" },
  description: DESCRIPTION,
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: "/brand/favicon.svg",
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "mask-icon", url: "/brand/icon-maskable.svg", color: "#B45309" }],
  },
  openGraph: {
    title: "dogwatch — the night watch",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "dogwatch",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "dogwatch — Agent James" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "dogwatch — the night watch",
    description: DESCRIPTION,
    images: ["/brand/og.png"],
  },
};

/**
 * JSON-LD for every route: the site as a WebSite whose author is the same Person entity
 * agentjames publishes (@id), so engines can join the sites to one maker. Rendered as a
 * native script tag per the Next.js JSON-LD guide; "<" is escaped so the payload can never
 * close the tag.
 */
const siteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "dogwatch",
  url: "https://dogwatch-two.vercel.app",
  author: {
    "@type": "Person",
    "@id": "https://agentjames.vercel.app/#person",
    name: "James Lorenz Santos",
    url: "https://agentjames.vercel.app",
    sameAs: [
      "https://www.linkedin.com/in/james-lorenz-santos-720776251/",
      "https://github.com/jamessuuu",
      "https://www.onlinejobs.ph/jobseekers/info/2766463",
      "https://ph.jobstreet.com/profiles/jameslorenz-santos-SXdpKyGqdK",
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* The two faces above the fold. Preloaded so the headline and the
         * measured numbers paint in their real faces rather than swapping;
         * the metric-matched fallbacks in globals.css mean a swap costs no
         * layout shift either way. Newsreader is NOT preloaded — it is used
         * further down the page and can arrive late. */}
        <link rel="preload" href="/fonts/archivo-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/commit-mono-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd).replace(/</g, "\u003c") }}
        />
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8 sm:py-14">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
