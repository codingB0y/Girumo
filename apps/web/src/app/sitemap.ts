import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getPublicSiteUrl();
  const now = new Date();
  return [
    { url: siteUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    // /demo é a porta de entrada real desde o CTA principal da landing (lp3) —
    // ver src/lib/public-pages.ts. Prioridade logo abaixo da home.
    { url: `${siteUrl}/demo`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${siteUrl}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
