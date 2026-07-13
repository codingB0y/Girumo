import type { MetadataRoute } from "next";
import { BRAND, BRAND_COLORS } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/",
    display: "standalone",
    background_color: BRAND_COLORS.canvas,
    theme_color: BRAND_COLORS.volt,
    icons: [
      {
        src: "/brand/girumo/png/symbol-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/girumo/png/symbol-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    shortcuts: [
      {
        name: "Girumo Campanhas",
        short_name: "Campanhas",
        url: "/painel/campanhas",
        icons: [
          {
            src: "/brand/girumo/png/symbol-192.png",
            sizes: "192x192",
          },
        ],
      },
      {
        name: "Girumo Grupos",
        short_name: "Grupos",
        url: "/painel/grupos",
        icons: [
          {
            src: "/brand/girumo/png/symbol-192.png",
            sizes: "192x192",
          },
        ],
      },
      {
        name: "Girumo Pages",
        short_name: "Pages",
        url: "/painel/pages",
        icons: [
          {
            src: "/brand/girumo/png/symbol-192.png",
            sizes: "192x192",
          },
        ],
      },
    ],
  };
}
