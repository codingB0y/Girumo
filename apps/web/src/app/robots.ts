import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getPublicSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Área logada e rotas internas não devem ser indexadas.
      //
      // `/p/` (LPs dos lojistas) e `/r/` (redirect de link rastreado) entram
      // pelo mesmo motivo: são páginas de terceiros, em volume, cujo conteúdo
      // não controlamos. O `index: false` no metadata da própria página é o
      // gate real — o Disallow aqui apenas evita gastar orçamento de rastreio.
      // Os dois juntos são de propósito: Disallow sozinho impediria o robô de
      // LER o noindex de uma URL que ele já conhecesse por link externo.
      disallow: ["/painel", "/api", "/p/", "/r/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
