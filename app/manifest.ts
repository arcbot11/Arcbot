import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Arc Bot",
    short_name: "Arc Bot",
    description: "Buy, sell, swap, and send tokens on Arc.",
    start_url: "/",
    display: "standalone",
    background_color: "#061322",
    theme_color: "#061322",
    icons: [
      { src: "/faviconlarge.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
