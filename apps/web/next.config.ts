import type { NextConfig } from "next";

import { withSentryConfig } from "@sentry/nextjs";

import { SENTRY_CSP_HOST } from "./src/lib/observability/sentry-options";

/**
 * 'unsafe-eval' SÓ em dev: os chunks do Turbopack/HMR usam eval; sem isso a
 * hidratação morre em silêncio (o form vira submit GET nativo). Produção não
 * precisa dele em rota nenhuma — M5 da auditoria.
 */
const EVAL_IN_DEV = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

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
      // 'unsafe-inline' segue aqui porque estas rotas são pré-renderizadas em
      // HTML no build (42 delas: home, /lp, /login, todo o /painel) — nonce
      // por-request não teria como entrar nesse HTML. As superfícies públicas
      // que renderizam por request usam nonce (src/lib/security/csp.ts).
      `script-src 'self' 'unsafe-inline'${EVAL_IN_DEV} https://js.stripe.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self'",
      `connect-src 'self' https://*.supabase.co https://api.stripe.com wss://*.supabase.co ${SENTRY_CSP_HOST}`,
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
 * Superfícies públicas com nonce (/p/* e /r/*): a CSP delas NÃO sai daqui, sai
 * do middleware, porque o nonce muda a cada request. Header estático de CSP aqui
 * sairia duplicado na resposta e o browser passaria a exigir as duas políticas
 * ao mesmo tempo. Os demais headers de segurança continuam estáticos.
 * Ver `src/lib/security/csp.ts`.
 */
const headersWithoutCsp = securityHeaders.filter(
  (h) => h.key !== "Content-Security-Policy",
);

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
      `script-src 'self' 'unsafe-inline'${EVAL_IN_DEV}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self'",
      `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${SENTRY_CSP_HOST}`,
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
        // tudo, exceto /p/*, /r/* e a prévia do editor (todas com regra própria
        // abaixo). Ficam FORA do match global pra não sair header duplicado.
        // `p$`/`r$` cobrem os paths exatos /p e /r: `:path*` na regra dedicada
        // casa zero segmentos, então sem eles esses dois sairiam com dois
        // headers de CSP.
        source: "/((?!p/|p$|r/|r$|editor-preview).*)",
        headers: securityHeaders,
      },
      {
        source: "/editor-preview",
        headers: previewFrameHeaders,
      },
      {
        // CSP destas duas vem do middleware (nonce por-request).
        source: "/p/:path*",
        headers: headersWithoutCsp,
      },
      {
        source: "/r/:path*",
        headers: headersWithoutCsp,
      },
    ];
  },
};

/**
 * Envelope do Sentry — aplicado SÓ quando há DSN.
 *
 * `withSentryConfig` faz upload de source map no build e, para isso, quer
 * `SENTRY_AUTH_TOKEN` e organização/projeto. Aplicá-lo incondicionalmente
 * significaria que um build sem essas variáveis passa a depender delas — e
 * dependência nova e silenciosa no caminho de build já parou o deploy deste
 * projeto por horas antes (21/08, `dotenv` declarado só na raiz). Sem DSN, o
 * arquivo exporta exatamente o mesmo objeto que exportava antes deste PR.
 *
 * `silent` evita ruído no log de build; `widenClientFileUpload` melhora o
 * mapeamento dos chunks do App Router.
 */
export default SENTRY_CSP_HOST && process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: true,
      widenClientFileUpload: true,
      // Sem token de upload não há source map para enviar; o SDK segue
      // funcionando, só com stack trace minificado.
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
    })
  : nextConfig;
