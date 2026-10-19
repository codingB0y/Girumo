// apps/web/src/lib/bio/painel-api.ts
import "server-only";

import { SLUG_BIO, slugReservado, type DocumentoBio } from "@/lib/bio/documento";
import { dayBR, dayBRAgo } from "@/lib/date-br";
import type { PaginaBio } from "@/lib/stores/bio-pages";

/**
 * O que as três rotas de `app/api/link-da-bio` repartem (spec 2026-10-19-link-da-bio §8–§10).
 * O painel (PR 6a/6b) importa daqui só os tipos, com `import type`: o `server-only` não vai junto.
 */

export type CampanhaDoPainel = { id: string; nome: string; slug: string | null };

/** Corpo de `GET /api/link-da-bio`. */
export type RespostaDoPainelBio = {
  pagina: PaginaBio | null;
  campanhas: CampanhaDoPainel[];
  /** Hostname do domínio próprio ATIVO, sem esquema; pendente não conta. */
  dominio: string | null;
  /** `getPublicSiteUrl()`: o painel monta `${origemGirumo}/bio/${slug}`, nunca com o Host da request. */
  origemGirumo: string;
  /** Sem página: endereço livre para o "Criar minha página". Com página: o slug dela. */
  sugestaoSlug: string;
  linksEscondidos: string[];
};

/** Corpo de `PATCH /api/link-da-bio`: a página inteira, nunca um pedaço. */
export type CorpoDoPatchBio = { versao: number; slug: string; publicada: boolean; documento: DocumentoBio };

export type MotivoDoSlug = "formato" | "reservado" | "em-uso";

/** Corpo de `GET /api/link-da-bio/slug?valor=`. */
export type RespostaDoSlug = { disponivel: true } | { disponivel: false; motivo: MotivoDoSlug };

/** Erro das três rotas. Os 401/403 de sessão, de loja e da vendedora saem em texto, como em todo o painel. */
export type ErroDoPainelBio = { error: string; campo?: string; motivo?: "versao" | "slug" };

/** Por que o slug não serve, ou `null`. `em-uso` só o banco sabe (`slugDisponivel`). */
export function motivoDoSlug(slug: string): Exclude<MotivoDoSlug, "em-uso"> | null {
  // O `SLUG_BIO` do PR 2 já confere o tamanho (3–40, como o check do banco) junto com o formato.
  if (!SLUG_BIO.test(slug)) return "formato";
  return slugReservado(slug) ? "reservado" : null;
}

/** `?dias=7|30` → os últimos N dias contando hoje, em Brasília (spec §7). Fora disso, `null` (400). */
export function periodoDoRelatorio(dias: string | null, agora: Date = new Date()): { desde: string; ate: string } | null {
  if (dias !== "7" && dias !== "30") return null;
  return { desde: dayBRAgo(Number(dias) - 1, agora), ate: dayBR(agora) };
}
