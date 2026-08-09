import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { Nav } from "../components/Nav";
import { SITE_DESCRIPTION } from "../lib/site";
import "./globals.css";

const SITE_URL = "https://dogwatch.vercel.app";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <Nav />
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
