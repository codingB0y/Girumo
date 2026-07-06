import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co https://api.stripe.com wss://*.supabase.co",
      // player.vimeo.com: vídeo real do bazar Mega Stock no case da /lp
      "frame-src https://js.stripe.com https://hooks.stripe.com https://player.vimeo.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

/**
 * CSP das LPs públicas (/p/*) — Flow Pages.
 * Difere da global: foto vem de URL https arbitrária do lojista (img-src https:)
 * e a sessão de tracking injeta Meta Pixel + GA4 (script/connect liberados
 * SÓ pros domínios desses vendors). Sem Stripe, sem frames, sem eval.
 */
const publicLpHeaders = [
  ...securityHeaders.filter((h) => h.key !== "Content-Security-Policy"),
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-eval' SÓ em dev: os chunks do Turbopack/HMR usam eval;
      // sem isso a hidratação morre em silêncio (form vira submit GET nativo)
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://connect.facebook.net https://www.googletagmanager.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://www.facebook.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        // tudo, exceto /p/* (LPs públicas têm CSP própria abaixo)
        source: "/((?!p/).*)",
        headers: securityHeaders,
      },
      {
        source: "/p/:path*",
        headers: publicLpHeaders,
      },
    ];
  },
};

export default nextConfig;
