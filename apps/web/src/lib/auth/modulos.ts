import type { TenantRole } from "@/lib/permissions";

/**
 * Acesso por módulo da vendedora (spec 2026-10-07-acesso-vendedora §1).
 *
 * Só vale para `seller`: dono, admin e operador passam direto, como sempre.
 * Para `seller` é FECHADO por padrão — rota fora deste mapa é 403, inclusive a
 * que alguém criar amanhã sem saber que a vendedora existe.
 *
 * Duas camadas, sem misturar: aqui é QUAL rota ela alcança; o que cada papel
 * faz dentro da rota continua em `lib/permissions.ts`.
 *
 * Sem `server-only`: o painel usa o mesmo mapa no menu e na guarda de página.
 */

export const MODULOS_OPCIONAIS = ["postar"] as const;
export type ModuloOpcional = (typeof MODULOS_OPCIONAIS)[number];
/** `vendas` é implícito para `seller` e nunca é gravado em `memberships.modules`. */
export type Modulo = "vendas" | ModuloOpcional;
export type Acesso = { role: TenantRole; modules: readonly ModuloOpcional[] };

export const MENSAGEM_BLOQUEIO = "Área não liberada para o seu acesso.";

/** `*` casa exatamente um segmento. Método sempre em maiúsculas. */
export const ROTAS: Readonly<
  Record<Modulo | "base", ReadonlyArray<{ padrao: string; metodos: readonly string[] }>>
> = {
  base: [{ padrao: "/api/auth/me", metodos: ["GET"] }],
  vendas: [
    { padrao: "/api/vendas/contato", metodos: ["GET"] },
    { padrao: "/api/vendas", metodos: ["GET", "POST"] },
    { padrao: "/api/vendas/*", metodos: ["PATCH", "DELETE"] },
  ],
  // O que `painel/disparos/page.tsx`, `folha-postar.tsx`, o upload do
  // `message-composer.tsx` (`media-upload-client.ts`) e o `copy-picker.tsx` chamam.
  postar: [
    { padrao: "/api/campanhas", metodos: ["GET"] },
    { padrao: "/api/groups", metodos: ["GET"] },
    { padrao: "/api/disparos", metodos: ["GET"] },
    { padrao: "/api/session", metodos: ["GET"] },
    { padrao: "/api/library", metodos: ["GET"] },
    { padrao: "/api/campanhas/*/messages", metodos: ["POST"] },
    { padrao: "/api/media/prepare", metodos: ["POST"] },
    { padrao: "/api/media/register", metodos: ["POST"] },
  ],
};

/** Páginas do /painel. Cada entrada libera a página e o que estiver embaixo dela. */
export const PAGINAS: Readonly<Record<Modulo, readonly string[]>> = {
  vendas: ["/painel/vendas"],
  postar: ["/painel/disparos"],
};

/** Filtra para os módulos opcionais conhecidos, sem repetição. Lixo vira []. */
export function parseModulos(raw: unknown): ModuloOpcional[] {
  if (!Array.isArray(raw)) return [];
  return MODULOS_OPCIONAIS.filter((modulo) => raw.includes(modulo));
}

/** seller → ["vendas", ...modules]; outros papéis → []. Módulo desconhecido em `modules` é ignorado. */
export function modulosDoAcesso(acesso: Acesso): Modulo[] {
  return acesso.role === "seller" ? ["vendas", ...parseModulos(acesso.modules)] : [];
}

/** O que `*` aceita: um id ou slug. Fora disso (`.`, `..`, `%`, `?`, `#`, `\`) o mapa não casa. */
const SEGMENTO_SEGURO = /^[A-Za-z0-9_-]+$/;
/** `.`, `..` e os escapes deles. Páginas aceitam o resto, mas nunca isto. */
const SEGMENTO_DE_PONTOS = /^(?:\.|%2e){1,2}$/i;

/**
 * Segmentos do caminho, ou `null` se não começa com "/" (nada casa). Sai no
 * máximo UMA barra do fim (`/api/vendas/` = `/api/vendas`); barra dupla vira
 * segmento vazio, que nenhum padrão casa.
 */
function segmentos(caminho: string): string[] | null {
  if (!caminho.startsWith("/")) return null;
  const semBarraFinal = caminho.endsWith("/") ? caminho.slice(0, -1) : caminho;
  return semBarraFinal.split("/").slice(1);
}

function casa(padrao: string, caminho: readonly string[]): boolean {
  const partes = segmentos(padrao) ?? [];
  return (
    partes.length === caminho.length &&
    partes.every((parte, i) => (parte === "*" ? SEGMENTO_SEGURO.test(caminho[i]) : parte === caminho[i]))
  );
}

/**
 * Papel ≠ seller → true. seller → rota da base ou de um módulo liberado, com o método certo.
 * `pathname` vem de `URL.pathname` (sem query string); o que não for isso não casa.
 */
export function podeAcessar(acesso: Acesso, pathname: string, method: string): boolean {
  if (acesso.role !== "seller") return true;
  const caminho = segmentos(pathname);
  if (!caminho) return false;
  const verbo = method.toUpperCase();
  const liberados: ReadonlyArray<Modulo | "base"> = ["base", ...modulosDoAcesso(acesso)];
  return liberados.some((modulo) =>
    ROTAS[modulo].some((rota) => rota.metodos.includes(verbo) && casa(rota.padrao, caminho)),
  );
}

/**
 * Mesmo princípio para páginas do /painel, por prefixo de segmento:
 * `/painel/vendas` libera `/painel/vendas/qualquer`, não `/painel/vendasx`.
 * `pathname` vem de `URL.pathname` (sem query string). Dot segments e segmentos
 * vazios nunca passam. É só experiência — quem barra de verdade é a API.
 */
export function paginaLiberada(acesso: Acesso, pathname: string): boolean {
  if (acesso.role !== "seller") return true;
  const caminho = segmentos(pathname);
  if (!caminho || caminho.some((parte) => parte === "" || SEGMENTO_DE_PONTOS.test(parte))) return false;
  return modulosDoAcesso(acesso).some((modulo) =>
    PAGINAS[modulo].some((pagina) => (segmentos(pagina) ?? []).every((parte, i) => parte === caminho[i])),
  );
}
