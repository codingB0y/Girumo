import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getPublicSiteUrl();
  const now = new Date();
  return [
    { url: siteUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    // /signup saiu junto com a separação de domínios (01/09/2026): a página
    // agora vive em app.girumo.com.br, porque criar conta em www nascia com a
    // sessão no host errado. Anunciar aqui uma URL que responde 308 seria o
    // mesmo erro que declarar o apex — todo item do sitemap viraria redirect.
    // /login saiu: é página utilitária, agora marcada `index: false` no próprio
    // layout. Anunciar no sitemap uma URL que pedimos para não indexar é sinal
    // contraditório — o sitemap é declaração do que QUEREMOS no índice.
    //
    // Termos e privacidade entram: são as duas únicas páginas públicas de
    // conteúdo próprio que existem hoje além da home e do /signup.
    // Prioridade baixa e frequência anual porque mudam com a versão legal
    // (LEGAL_VERSION), não com o produto.
    { url: `${siteUrl}/termos`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/privacidade`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
