/**
 * CSP com nonce por-request — M5 da auditoria de segurança.
 *
 * ESCOPO, e por que ele não é o app inteiro: o nonce nasce a cada request, e
 * `next build` pré-renderiza 42 rotas em HTML estático (home, /lp, /login e todo
 * o /painel). Esse HTML sai do build com os scripts inline do Next já dentro —
 * não há onde injetar um nonce depois. Colocar nonce nelas exigiria
 * `force-dynamic` em todas, trocando o shell servido do CDN por SSR a cada
 * request. Fora de escopo aqui: essas rotas seguem com a CSP estática do
 * next.config (com 'unsafe-inline', sem 'unsafe-eval' em produção).
 *
 * O que ENTRA: as duas superfícies públicas que já renderizam por request e que
 * recebem conteúdo controlado pelo lojista — /p/:slug (headline, foto, ids de
 * pixel) e /r/:slug (intersticial com o Pixel do Meta). É onde um XSS teria de
 * onde sair, e o nonce ali custa zero em performance.
 */

import { SENTRY_CSP_HOST } from "@/lib/observability/sentry-options";

export type NonceSurface = "public-lp" | "click-redirect";

/**
 * Só as rotas SEM pré-render entram. Antes de adicionar uma superfície aqui,
 * confirme que ela não vira `.html` em `.next/server/app` — se virar, o nonce
 * do header nunca vai bater com o do HTML e a página morre em silêncio.
 */
export function surfaceForPath(pathname: string): NonceSurface | null {
  if (pathname === "/p" || pathname.startsWith("/p/")) return "public-lp";
  if (pathname === "/r" || pathname.startsWith("/r/")) return "click-redirect";
  return null;
}

/**
 * 16 bytes (128 bits) aleatórios em base64. O charset precisa casar com o regex
 * que o Next usa pra extrair o nonce do header da request — se não casar, ele
 * ignora em silêncio, os scripts saem sem nonce e a página morre inteira.
 * Web Crypto porque o middleware roda no runtime Edge.
 */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const NONCE_RE = /^[A-Za-z0-9+/]{16,}={0,2}$/;

/**
 * Atributo `nonce="..."` pronto pra interpolar em HTML montado à mão. Valida o
 * formato antes: o valor só deveria vir do `generateNonce()` acima via header
 * que o middleware SOBRESCREVE, mas quem monta HTML por concatenação não deve
 * depender dessa garantia estar duas camadas acima — se o formato não bate, o
 * atributo não sai. Base64 não tem aspas nem `<`, então o valor validado é
 * seguro dentro do atributo.
 */
export function nonceAttribute(nonce: string | null | undefined): string {
  return nonce && NONCE_RE.test(nonce) ? ` nonce="${nonce}"` : "";
}

/**
 * 'unsafe-eval' SÓ em dev: os chunks do Turbopack/HMR usam eval e sem isso a
 * hidratação morre em silêncio (o form vira submit GET nativo). Em produção
 * nenhuma superfície precisa dele.
 */
function scriptSrc(nonce: string, isDev: boolean, ...hosts: string[]): string {
  const sources = ["'self'", `'nonce-${nonce}'`];
  if (isDev) sources.push("'unsafe-eval'");
  return ["script-src", ...sources, ...hosts].join(" ");
}

export function buildCsp(surface: NonceSurface, nonce: string, isDev: boolean): string {
  if (surface === "click-redirect") {
    // Intersticial de clique: os scripts inline são nossos (snippet do Pixel, do
    // gtag e o location.replace) — todos nonce-ados no route handler. De
    // terceiros entram só os dois hosts de tag: fbevents.js do Meta e gtag.js do
    // Google. A conversão do Google Ads chega como IMAGEM (googleads/doubleclick),
    // não como fetch — sem esses dois no img-src ela morre em silêncio.
    return [
      "default-src 'self'",
      scriptSrc(nonce, isDev, "https://connect.facebook.net", "https://www.googletagmanager.com"),
      "style-src 'unsafe-inline'",
      "img-src 'self' data: https://www.facebook.com https://www.google.com https://googleads.g.doubleclick.net",
      `connect-src https://www.facebook.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com ${SENTRY_CSP_HOST}`,
      "font-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
  }

  // LP pública (/p/:slug) — mesma política que estava no next.config, com o
  // nonce no lugar de 'unsafe-inline'. img-src https: porque a foto vem de uma
  // URL arbitrária do lojista; script/connect liberados só pros dois vendors
  // que a sessão de tracking injeta (Meta Pixel e GA4).
  return [
    "default-src 'self'",
    scriptSrc(
      nonce,
      isDev,
      "https://connect.facebook.net",
      "https://www.googletagmanager.com",
    ),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src 'self' https://www.facebook.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com ${SENTRY_CSP_HOST}`,
    // Depoimento em vídeo (§6.1): o facade cria o iframe do provedor SÓ após o
    // clique na capa — são os dois provedores que o parseVideoUrl aceita.
    "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
