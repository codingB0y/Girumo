/**
 * Separação de domínios: `www` é o site público, `app` é a aplicação.
 *
 * Os dois hosts servem o MESMO deployment na Vercel (um projeto, três domínios:
 * app, apex e www). Como o cookie de sessão `dz_session` é host-only — repare
 * que `sessionCookieOptions` em `lib/auth.ts` não declara `domain` —, quem
 * logava em `www` continuava visitante em `app`, e via "telas diferentes" que
 * na verdade eram o mesmo código com estado de sessão diferente.
 *
 * A lista mora aqui, e não inline no `next.config.ts`, porque aquele arquivo
 * importa `@sentry/nextjs` e não roda sob `tsx --test`. Daqui ela é testável de
 * verdade — mesmo motivo de `lib/public-pages` existir para o middleware.
 *
 * Redirects do `next.config` rodam ANTES do middleware: quem chega em
 * `www/painel` nunca é avaliado pelo gate de sessão de `www`, vai direto para
 * `app`, onde o cookie mora.
 */

export const PUBLIC_SITE_HOST = "www.girumo.com.br";
export const APP_HOST = "app.girumo.com.br";

/**
 * Superfícies que LEEM ou CRIAM sessão, e por isso precisam morar num host só.
 *
 * `:path*` casa zero segmentos, então `/painel/:path*` já cobre `/painel` puro
 * (é o mesmo motivo de `next.config` precisar excluir `p$` e `r$` da regra
 * geral de headers).
 *
 * `/auth/callback` entra porque o login com Google é client-side: o
 * `redirectTo` sai de `window.location.origin`, então o callback caindo em
 * `www` faria a sessão nascer em `www`.
 *
 * `/api/*` fica de fora DE PROPÓSITO: webhook não segue redirect. O da Stripe
 * trata 3xx como falha de entrega, e o da Evolution idem. Redirecionar `/api`
 * pararia de entregar evento se algum deles estiver apontado para `www`.
 */
export const APP_ONLY_PATHS = [
  "/painel/:path*",
  "/admin/:path*",
  "/login",
  "/signup",
  "/auth/callback",
] as const;

export type HostRedirect = {
  source: string;
  has: { type: "host"; value: string }[];
  destination: string;
  permanent: true;
};

/**
 * O `has` de host não é decorativo: sem ele a regra casaria no próprio `app`
 * (loop infinito) e nos previews `*.vercel.app`.
 *
 * `permanent: true` = 308, que preserva método e querystring — é o que mantém
 * o `?next=` do gate de auth vivo na travessia.
 */
export function appDomainRedirects(): HostRedirect[] {
  return APP_ONLY_PATHS.map((source) => ({
    source,
    has: [{ type: "host" as const, value: PUBLIC_SITE_HOST }],
    destination: `https://${APP_HOST}${source}`,
    permanent: true as const,
  }));
}
