import type { MetadataRoute } from "next";

/**
 * Minimal web app manifest: names, brand colors, and the Overload app icon so
 * an installed/home-screen shortcut carries the brand. Not a full PWA (no
 * offline/service worker — the app deliberately has no offline mode).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Overload",
    short_name: "Overload",
    description: "A single-user strength training tracker.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0c",
    theme_color: "#0b0b0c",
    icons: [
      {
        src: "/brand/overload-icon.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
