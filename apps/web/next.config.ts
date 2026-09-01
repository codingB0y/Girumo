import type { NextConfig } from "next";

import { withSentryConfig } from "@sentry/nextjs";

import { appDomainRedirects } from "./src/lib/domain-redirects";
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
  /**
   * Rota que deixou de existir e JA tinha sido anunciada ao Google.
   *
   * `redirects` do next.config roda ANTES do middleware. Sem esta entrada quem
   * assume o caminho e o middleware: `/demo` saiu de PUBLIC_PAGES, entao vira
   * `307 -> /login?next=/demo` — um soft-404 apontando para uma pagina marcada
   * `index: false`. O /demo ficou anunciado no sitemap com prioridade 0.9 de
   * 29 a 31/08/2026, entao pode ter sido indexado; o 308 para a home consolida
   * o sinal e tira a URL do indice.
   */
  async redirects() {
    return [
      { source: "/demo", destination: "/", permanent: true },
      // Separação de domínios: www é o site público, app é a aplicação. A lista
      // e o porquê moram em `src/lib/domain-redirects.ts`, que tem teste — este
      // arquivo importa @sentry/nextjs e não roda sob `tsx --test`.
      ...appDomainRedirects(),
    ];
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
      // Remove do bundle o código que não exercemos. Medido em produção em
      // 27/08: o SDK chegava a 194 KB na tela de login — METADE de todo o
      // JavaScript da página, e o maior arquivo dela, maior que qualquer
      // código nosso. Carrega assíncrono, então não atrasa o primeiro
      // desenho; o custo é CPU e rede exatamente na janela em que a página
      // deveria ficar clicável, que é onde se sente sem aparecer no TTFB.
      //
      // `excludeTracing` vale para servidor E cliente — esta opção não separa
      // os dois. É de propósito: o plano free dá 5k eventos/mês e, como diz o
      // comentário de `tracesSampleRate`, quando a cota acaba os ERROS param
      // de chegar. Tracing de servidor consome a mesma cota que existe para
      // proteger o erro.
      //
      // `excludeReplayWorker` fica de FORA: a documentação só o libera para
      // quem hospeda o worker de compressão por conta própria, o que não é o
      // nosso caso.
      bundleSizeOptimizations: {
        excludeTracing: true,
        excludeDebugStatements: true,
        excludeReplayShadowDom: true,
        excludeReplayIframe: true,
      },
    })
  : nextConfig;
