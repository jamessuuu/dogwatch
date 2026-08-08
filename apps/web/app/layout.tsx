import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { Nav } from "../components/Nav";
import "./globals.css";

const SITE_URL = "https://dogwatch.vercel.app";
const DESCRIPTION =
  "The night watch over the six public surfaces of the Agent James program. Every night: what it checked, what it found, what it did, what it refused, and what it cost — published as one immutable record.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "dogwatch", template: "%s — dogwatch" },
  description: DESCRIPTION,
  icons: {
    icon: "/brand/favicon.svg",
    shortcut: "/brand/favicon.svg",
  },
  openGraph: {
    title: "dogwatch — the night watch",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "dogwatch",
    images: [{ url: "/brand/og.svg", width: 1200, height: 630, alt: "dogwatch — Agent James" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "dogwatch — the night watch",
    description: DESCRIPTION,
    images: ["/brand/og.svg"],
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
