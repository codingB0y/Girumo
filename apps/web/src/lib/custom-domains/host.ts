/**
 * Fronteira entre os hosts do Girumo e os domínios próprios dos lojistas.
 * Roda no middleware (Edge): nada de import de Node aqui.
 */

/**
 * Hosts do próprio Girumo — o resto é domínio de lojista.
 *
 * O MESMO texto mora literal no `matcher` do middleware, porque o Next exige
 * config estática ali; `host.test.ts` lê o middleware e trava os dois iguais.
 * O Next compara com o host sem porta e em minúsculas, ancorando `^…$`: o grupo
 * externo é o que impede a alternação de escapar da âncora.
 */
export const FIRST_PARTY_HOST_PATTERN =
  "(?:localhost|127\\.0\\.0\\.1|(?:[a-z0-9-]+\\.)*(?:girumo\\.com\\.br|hubflow\\.com\\.br|vercel\\.app|localhost))";

const FIRST_PARTY_HOST_RE = new RegExp(`^${FIRST_PARTY_HOST_PATTERN}$`);

export function isFirstPartyHost(hostname: string): boolean {
  return FIRST_PARTY_HOST_RE.test(hostname.trim().toLowerCase());
}

/** `Host` da request sem porta e em minúsculas — o mesmo recorte que o Next faz. */
export function hostnameFromHostHeader(host: string | null): string {
  return (host ?? "").split(":", 1)[0].trim().toLowerCase();
}

export type CustomHostRoute = "surface" | "public-api" | "not-found";

/**
 * O que um domínio de lojista serve: os links (/r, /c), as páginas (/p) e as
 * APIs públicas que essas páginas chamam (/api/p — lead, track e mídia).
 * Painel, login e API logada não existem nesse endereço.
 */
export function customHostRoute(pathname: string): CustomHostRoute {
  if (/^\/[rcp]\//.test(pathname)) return "surface";
  if (pathname.startsWith("/api/p/")) return "public-api";
  return "not-found";
}
