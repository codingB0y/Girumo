import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getPublicSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Área logada e rotas internas não devem ser indexadas.
      disallow: ["/painel", "/api"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
