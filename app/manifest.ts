import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Argos Bot",
    short_name: "Argos Bot",
    description: "Buy, sell, swap, and send tokens on Arc.",
    start_url: "/",
    display: "standalone",
    background_color: "#061322",
    theme_color: "#061322",
    icons: [
      { src: "/brand/argos-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/argos-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
