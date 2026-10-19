import "server-only";

import { UUID_BIO, type DocumentoBio } from "@/lib/bio/documento";
import { randomSuffix } from "@/lib/pages/slug";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Store do link da bio (spec 2026-10-19-link-da-bio §5 e §9). As três tabelas têm RLS sem
 * policy e o service-role passa por cima: o filtro `tenant_id` é a proteção real, e toda query
 * em `bio_pages` leva o seu — menos as três leituras públicas (por slug e por id), que são o
 * ponto de entrada sem loja, como `getTrackedLinkBySlug`; ali quem filtra é `publicada` e
 * `bloqueada_em`, e o `tenant_id` da linha passa a valer daí em diante. `bio_slugs` não tem
 * `tenant_id`: é lida só por slug.
 */

const PAGINAS = "bio_pages";
const SLUGS = "bio_slugs";
const COLUNAS = "id, tenant_id, slug, publicada, bloqueada_em, documento, versao, updated_at";
const UNIQUE_VIOLATION = "23505";
const TENTATIVAS_DE_SLUG = 3;
const DIA_MS = 86_400_000;
const MAX_DIAS_DO_RELATORIO = 366;

export type PaginaBio = {
  id: string;
  tenantId: string;
  slug: string;
  publicada: boolean;
  bloqueadaEm: string | null;
  documento: DocumentoBio;
  versao: number;
  updatedAt: string;
};

export type RelatorioBio = {
  visitas: number;
  toques: number;
  porLink: { linkId: string; toques: number }[];
  porDia: { dia: string; visitas: number; toques: number }[];
};

type Linha = {
  id: string;
  tenant_id: string;
  slug: string;
  publicada: boolean;
  bloqueada_em: string | null;
  documento: DocumentoBio;
  versao: number;
  updated_at: string;
};

type ErroDoBanco = { code?: string; message: string; details?: string | null };

function paraPagina(l: Linha): PaginaBio {
  return {
    id: l.id,
    tenantId: l.tenant_id,
    slug: l.slug,
    publicada: l.publicada,
    bloqueadaEm: l.bloqueada_em,
    documento: l.documento,
    versao: l.versao,
    updatedAt: l.updated_at,
  };
}

/**
 * Qual unique o 23505 bateu (nomes fixados no PR 1): a loja já tem página, ou o slug é de outra
 * página — atual (`bio_pages_slug_key`) ou de antes (o trigger `bio_pages_registra_slug`, cuja
 * mensagem começa com `bio_slugs:`). Outro 23505 não é esperado e sobe como erro.
 */
function conflito(e: ErroDoBanco): "loja" | "slug" | null {
  if (e.code !== UNIQUE_VIOLATION) return null;
  const texto = `${e.message} ${e.details ?? ""}`;
  if (texto.includes("bio_pages_tenant_id_key")) return "loja";
  if (texto.includes("bio_pages_slug_key") || texto.includes("bio_slugs")) return "slug";
  return null;
}

/** `loja-exemplo` → `loja-exemplo-k7m2` (no máximo 40, sem hífen duplo). */
function comSufixo(slug: string): string {
  return `${slug.slice(0, 35).replace(/-+$/, "")}-${randomSuffix(4)}`;
}

export async function lerPaginaDaLoja(tenantId: string): Promise<PaginaBio | null> {
  const { data, error } = await getSupabaseAdmin().from(PAGINAS).select(COLUNAS).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? paraPagina(data as Linha) : null;
}

/**
 * Cria a página da loja como rascunho. Idempotente: loja que já tem página (23505 em
 * `bio_pages_tenant_id_key`) recebe a que existe. Slug tomado tenta de novo com sufixo, como
 * `createLandingPage`. Quem chama já validou o slug (formato e `slugReservado`).
 */
export async function criarPaginaDaLoja(tenantId: string, slug: string, documento: DocumentoBio): Promise<PaginaBio> {
  for (let tentativa = 0; tentativa < TENTATIVAS_DE_SLUG; tentativa++) {
    const { data, error } = await getSupabaseAdmin()
      .from(PAGINAS)
      .insert({ tenant_id: tenantId, slug: tentativa === 0 ? slug : comSufixo(slug), publicada: false, documento })
      .select(COLUNAS)
      .single();
    if (!error) return paraPagina(data as Linha);
    const tipo = conflito(error);
    if (tipo === "loja") {
      const existente = await lerPaginaDaLoja(tenantId);
      if (existente) return existente;
      throw new Error("A página da loja sumiu entre o insert e a leitura.");
    }
    if (tipo !== "slug") throw new Error(error.message);
  }
  throw new Error("Não foi possível reservar um endereço livre. Tente de novo.");
}

/**
 * Salvar com trava otimista: o update só pega a linha da loja na `versao` que o painel leu, e
 * grava `versao + 1` e `updated_at` junto (espelho de `compareAndSwapLandingPage`). Nenhuma
 * linha = alguém salvou antes ("versao", 409) ou a loja não tem página ("sem-pagina", 404).
 */
export async function salvarPaginaDaLoja(
  tenantId: string,
  e: { versao: number; slug: string; publicada: boolean; documento: DocumentoBio },
): Promise<{ ok: true; pagina: PaginaBio } | { ok: false; motivo: "versao" | "slug" | "sem-pagina" }> {
  const { data, error } = await getSupabaseAdmin()
    .from(PAGINAS)
    .update({
      slug: e.slug,
      publicada: e.publicada,
      documento: e.documento,
      versao: e.versao + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("versao", e.versao)
    .select(COLUNAS)
    .maybeSingle();
  if (error) {
    if (conflito(error) === "slug") return { ok: false, motivo: "slug" };
    throw new Error(error.message);
  }
  if (data) return { ok: true, pagina: paraPagina(data as Linha) };
  return { ok: false, motivo: (await lerPaginaDaLoja(tenantId)) ? "versao" : "sem-pagina" };
}

/** Livre = nunca usado; ou já usado por esta mesma loja. Slug de página apagada fica preso. */
export async function slugDisponivel(slug: string, tenantId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from(SLUGS).select("pagina_id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return true;
  const paginaId = (data as { pagina_id: string | null }).pagina_id;
  if (!paginaId) return false;
  const { data: propria, error: erroDaPagina } = await supabase
    .from(PAGINAS)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", paginaId)
    .maybeSingle();
  if (erroDaPagina) throw new Error(erroDaPagina.message);
  return propria !== null;
}

/** Pelo slug atual ou por um antigo (`bio_slugs`): quem chama compara `pagina.slug` para o 301. */
export async function lerPublicadaPorSlug(slug: string): Promise<PaginaBio | null> {
  const { data, error } = await getSupabaseAdmin().from(SLUGS).select("pagina_id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  const paginaId = (data as { pagina_id: string | null } | null)?.pagina_id;
  return paginaId ? lerPublicadaPorId(paginaId) : null;
}

export async function lerPublicadaPorId(id: string): Promise<PaginaBio | null> {
  if (!UUID_BIO.test(id)) return null;
  const { data, error } = await getSupabaseAdmin()
    .from(PAGINAS)
    .select(COLUNAS)
    .eq("id", id)
    .eq("publicada", true)
    .is("bloqueada_em", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? paraPagina(data as Linha) : null;
}

export async function lerPublicadaDaLoja(tenantId: string): Promise<PaginaBio | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(PAGINAS)
    .select(COLUNAS)
    .eq("tenant_id", tenantId)
    .eq("publicada", true)
    .is("bloqueada_em", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? paraPagina(data as Linha) : null;
}

/**
 * +1 no contador do dia (`bio_contar`; a loja sai da página, no banco). `alvo` = `"visita"` ou o
 * uuid minúsculo do link — o CHECK `bio_contagens_alvo_check` recusa o resto, então nem chama.
 */
export async function contarBio(paginaId: string, alvo: string): Promise<void> {
  if (!UUID_BIO.test(paginaId)) throw new Error("Página de contagem inválida.");
  if (alvo !== "visita" && !UUID_BIO.test(alvo)) throw new Error("Alvo de contagem inválido.");
  const { error } = await getSupabaseAdmin().rpc("bio_contar", { p_pagina: paginaId, p_alvo: alvo });
  if (error) throw new Error(error.message);
}

/** `AAAA-MM-DD` que existe no calendário, em ms UTC; senão `null`. */
function diaEmMs(dia: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const ms = Date.parse(`${dia}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === dia ? ms : null;
}

/** Agregado no SQL (`bio_relatorio`), nunca no app: o PostgREST corta em 1000 linhas sem avisar. */
export async function relatorioBio(tenantId: string, desde: string, ate: string): Promise<RelatorioBio> {
  const inicio = diaEmMs(desde);
  const fim = diaEmMs(ate);
  if (inicio === null || fim === null) throw new Error("Data do relatório inválida.");
  if (fim < inicio || (fim - inicio) / DIA_MS > MAX_DIAS_DO_RELATORIO) throw new Error("Período do relatório inválido.");
  const { data, error } = await getSupabaseAdmin().rpc("bio_relatorio", { p_tenant: tenantId, p_desde: desde, p_ate: ate });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("bio_relatorio não devolveu nada.");
  return data as RelatorioBio;
}
