import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Veda RuralClass",
    short_name: "Veda",
    description: "Multi-grade classroom planner with an AI study companion.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0A0C",
    theme_color: "#0B0A0C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
