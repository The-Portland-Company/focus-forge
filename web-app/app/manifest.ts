import type { MetadataRoute } from "next";

// Web app manifest so Focus: Forge can be installed as a standalone app (e.g.
// "Add to Dock" on macOS via Safari/Chrome). An installed PWA is what lets the
// Badging API (navigator.setAppBadge) render the unread-email count on the Dock
// icon — without this manifest the OS treats the page as a regular tab and the
// badge never appears.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Focus: Forge",
    short_name: "Focus: Forge",
    description: "A powerful project management and task organization tool",
    start_url: "/",
    display: "standalone",
    background_color: "#0E0F16",
    theme_color: "#1f2937",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
      },
      {
        src: "/icon-192.png",
        type: "image/png",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  };
}
