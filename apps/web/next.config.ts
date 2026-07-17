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
      // 'self': a prévia do editor de LP embute /painel/pages/preview (mesma origem)
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://player.vimeo.com",
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
      // Depoimento em vídeo (§6.1): o facade cria o iframe do provedor SÓ após o
      // clique na capa. Com 'none' aqui o play morria em silêncio — são só os dois
      // provedores que o parseVideoUrl aceita, e o embed é montado por nós.
      "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

/**
 * Prévia do editor (/editor-preview) — a ÚNICA rota embutível do app.
 * `X-Frame-Options: DENY` recusa o iframe mesmo na própria origem, então aqui ele
 * vira SAMEORIGIN e a CSP declara `frame-ancestors 'self'` (o equivalente moderno,
 * que os browsers preferem quando os dois existem). Continua fechada pra fora: só
 * o próprio painel embute, e o clickjacking segue barrado no resto do app.
 * O frame-src interno é o do vídeo — a prévia mostra o depoimento como na página.
 */
const previewFrameHeaders = [
  ...securityHeaders.filter(
    (h) => h.key !== "X-Frame-Options" && h.key !== "Content-Security-Policy",
  ),
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
      "frame-ancestors 'self'",
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
        // tudo, exceto /p/* e a prévia do editor (ambas têm regra própria abaixo).
        // Ficam FORA do match global pra não sair header duplicado na resposta.
        source: "/((?!p/|editor-preview).*)",
        headers: securityHeaders,
      },
      {
        source: "/editor-preview",
        headers: previewFrameHeaders,
      },
      {
        source: "/p/:path*",
        headers: publicLpHeaders,
      },
    ];
  },
};

export default nextConfig;
