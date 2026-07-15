import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getPublicSiteUrl();
  const now = new Date();
  return [
    { url: siteUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${siteUrl}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
