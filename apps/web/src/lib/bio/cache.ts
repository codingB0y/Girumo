import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { estadoDosLinks } from "@/lib/bio/conferir";
import type { DadosRender } from "@/lib/bio/documento";
import { getPublicSiteUrl } from "@/lib/brand";
import { lerPublicadaDaLoja, lerPublicadaPorId, lerPublicadaPorSlug, type PaginaBio } from "@/lib/stores/bio-pages";

/**
 * Dado da página pública em cache; o HTML é montado a cada request, porque o nonce muda
 * (spec 2026-10-19-link-da-bio §6).
 *
 * Dois passos, de propósito: as tags de um `unstable_cache` são fixas ANTES de a função rodar,
 * e a loja só se conhece depois de achar a página. O passo 1 acha a página pela chave (slug,
 * loja ou id) com a tag da chave; o passo 2 (`nucleo`) monta os dados já com
 * `bio-loja:<loja>` e `bio-pagina:<id>` — é a tag da loja que deixa `invalidarBioDaLoja`
 * (campanha renomeada ou apagada) refazer o botão do grupo na hora.
 *
 * O cache guarda JSON (`unstable_cache` serializa): nada de `undefined`, Date ou Map aqui.
 * `unstable_cache` e `revalidateTag` não rodam fora do runtime do Next ("incrementalCache
 * missing" / "static generation store missing"), então o teste cobre `montarNucleo` e as tags;
 * o caminho com cache se prova no e2e da rota pública (PR 4a).
 */

const REVALIDATE = 300;

export type BuscaPorSlug = { tipo: "pagina"; dados: DadosRender } | { tipo: "mudou"; slugAtual: string } | null;
/** O que o passo 1 guarda: só a chave da página. */
export type PaginaAchada = Pick<PaginaBio, "id" | "tenantId" | "slug">;
/** O que o passo 2 guarda: o `DadosRender` sem o que depende de por onde se chegou. */
export type NucleoBio = Omit<DadosRender, "origem" | "dominioProprio">;

export const tagDoSlug = (slug: string): string => `bio-slug:${slug}`;
export const tagDaLoja = (tenantId: string): string => `bio-loja:${tenantId}`;
export const tagDaPagina = (id: string): string => `bio-pagina:${id}`;

/** Salvar no painel: os slugs (novo e antigo), a página e a loja (a raiz do domínio próprio é por loja). */
export function tagsParaInvalidar(i: { tenantId: string; paginaId: string; slugs: string[] }): string[] {
  return [...new Set([tagDaLoja(i.tenantId), tagDaPagina(i.paginaId), ...i.slugs.filter(Boolean).map(tagDoSlug)])];
}

function achada(p: PaginaBio | null): PaginaAchada | null {
  return p ? { id: p.id, tenantId: p.tenantId, slug: p.slug } : null;
}

/** Passo 2 sem o cache: relê a página pelo id e só monta se ela ainda é da mesma loja. */
export async function montarNucleo(a: PaginaAchada): Promise<NucleoBio | null> {
  const pagina = await lerPublicadaPorId(a.id);
  if (!pagina || pagina.tenantId !== a.tenantId) return null;
  return { documento: pagina.documento, paginaId: pagina.id, ...(await estadoDosLinks(pagina.tenantId, pagina.documento)) };
}

function achar(chave: string[], tag: string, ler: () => Promise<PaginaBio | null>): Promise<PaginaAchada | null> {
  return unstable_cache(async () => achada(await ler()), chave, { revalidate: REVALIDATE, tags: [tag] })();
}

function nucleo(a: PaginaAchada): Promise<NucleoBio | null> {
  return unstable_cache(() => montarNucleo(a), ["bio-nucleo", a.id, a.tenantId], {
    revalidate: REVALIDATE,
    tags: [tagDaLoja(a.tenantId), tagDaPagina(a.id)],
  })();
}

/** `/bio/<slug>`. Slug antigo da página = `mudou` (a rota responde 301 para o atual). */
export async function paginaPublicaPorSlug(slug: string): Promise<BuscaPorSlug> {
  const a = await achar(["bio-slug", slug], tagDoSlug(slug), () => lerPublicadaPorSlug(slug));
  if (!a) return null;
  if (a.slug !== slug) return { tipo: "mudou", slugAtual: a.slug };
  const n = await nucleo(a);
  return n ? { tipo: "pagina", dados: { ...n, origem: getPublicSiteUrl(), dominioProprio: false } } : null;
}

/** Raiz do domínio próprio: `origem` = `https://<host ativo>`, que vem da rota. */
export async function paginaPublicaDaLoja(tenantId: string, origem: string): Promise<DadosRender | null> {
  const a = await achar(["bio-loja", tenantId], tagDaLoja(tenantId), () => lerPublicadaDaLoja(tenantId));
  const n = a && (await nucleo(a));
  return n ? { ...n, origem, dominioProprio: true } : null;
}

/** Rota do toque: confere que a página está no ar e lê `linksEscondidos`. */
export async function paginaPublicaPorId(id: string): Promise<DadosRender | null> {
  const a = await achar(["bio-id", id], tagDaPagina(id), () => lerPublicadaPorId(id));
  const n = a && (await nucleo(a));
  return n ? { ...n, origem: getPublicSiteUrl(), dominioProprio: false } : null;
}

export function invalidarBio(i: { tenantId: string; paginaId: string; slugs: string[] }): void {
  for (const tag of tagsParaInvalidar(i)) revalidateTag(tag);
}

/** Campanha com slug trocado ou apagada (`PATCH`/`DELETE` de `/api/campanhas`, PR 4a). */
export function invalidarBioDaLoja(tenantId: string): void {
  revalidateTag(tagDaLoja(tenantId));
}
