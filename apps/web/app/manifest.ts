import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "../lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "dogwatch — the night watch",
    short_name: "dogwatch",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    theme_color: "#FAF7F2",
    background_color: "#FAF7F2",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
