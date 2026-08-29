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
    { url: `${siteUrl}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    // /login saiu: é página utilitária, agora marcada `index: false` no próprio
    // layout. Anunciar no sitemap uma URL que pedimos para não indexar é sinal
    // contraditório — o sitemap é declaração do que QUEREMOS no índice.
    //
    // Termos e privacidade entram: são as duas únicas páginas públicas de
    // conteúdo próprio que existem hoje além da home, do /demo e do /signup.
    // Prioridade baixa e frequência anual porque mudam com a versão legal
    // (LEGAL_VERSION), não com o produto.
    { url: `${siteUrl}/termos`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/privacidade`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
