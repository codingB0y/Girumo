import "server-only";

import { slugReservado } from "@/lib/bio/documento";
import { slugify } from "@/lib/pages/slug";
import type { MatrizAvisos, RastreioConfig } from "@/lib/rastreio/tipos";
import { getOrganizationProfile } from "@/lib/stores/organization-profile";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Config do Rastreio por loja (`tracking_settings`) e a flag `tenant_settings.rastreio_enabled`. As tabelas
 * têm RLS sem policy e o service-role passa por cima: o filtro `tenant_id` é a proteção real. As únicas
 * leituras sem loja são `lojasComRastreio` (é a lista de lojas) e o primeiro passo de `lojaPorSlug` (a
 * página pública entra pelo slug); dali em diante vale o `tenant_id` da linha.
 */

const CONFIGS = "tracking_settings";
const COLUNAS = "tenant_id, public_slug, matrix, notify_store_on_problem, vip_link_id, store_whatsapp, imported_at, sweep_cursor";
const UNIQUE_VIOLATION = "23505";
const CANDIDATOS_DE_SLUG = 10;
/** 40 do CHECK menos o "-10" do último candidato. */
const MAX_RAIZ = 37;

/** O slug escolhido já é de outra loja (o PR 6 responde 409). */
export class SlugEmUso extends Error {
  constructor() {
    super("rastreio: endereço já em uso por outra loja");
  }
}

type Linha = {
  tenant_id: string;
  public_slug: string;
  matrix: MatrizAvisos;
  notify_store_on_problem: boolean;
  vip_link_id: string | null;
  store_whatsapp: string | null;
  imported_at: string | null;
  sweep_cursor: string | null;
};

type ErroDoBanco = { code?: string; message: string; details?: string | null };

function paraConfig(l: Linha): RastreioConfig {
  return {
    tenantId: l.tenant_id,
    publicSlug: l.public_slug,
    matrix: l.matrix,
    notifyStoreOnProblem: l.notify_store_on_problem,
    vipLinkId: l.vip_link_id,
    storeWhatsapp: l.store_whatsapp,
    importedAt: l.imported_at,
    sweepCursor: l.sweep_cursor,
  };
}

/** Qual unique o 23505 bateu (nomes fixados no PR 1): o slug, ou a loja que já tem config. */
function conflito(e: ErroDoBanco): "slug" | "loja" | null {
  if (e.code !== UNIQUE_VIOLATION) return null;
  const texto = `${e.message} ${e.details ?? ""}`;
  if (texto.includes("tracking_settings_public_slug_key")) return "slug";
  if (texto.includes("tracking_settings_pkey")) return "loja";
  return null;
}

export async function rastreioLigado(tenantId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("tenant_settings")
    .select("rastreio_enabled")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.rastreio_enabled === true;
}

// ponytail: sem paginação — o PostgREST corta em 1000 lojas; paginar com range() quando chegar perto.
export async function lojasComRastreio(): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin().from("tenant_settings").select("tenant_id").eq("rastreio_enabled", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => l.tenant_id as string);
}

export async function lerConfig(tenantId: string): Promise<RastreioConfig | null> {
  const { data, error } = await getSupabaseAdmin().from(CONFIGS).select(COLUNAS).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? paraConfig(data as Linha) : null;
}

/** Slug do nome da loja: `raiz`, `raiz-2` … `raiz-10`. */
function candidatosDeSlug(storeName: string): string[] {
  const base = slugify(storeName);
  const raiz = slugReservado(base) ? "loja" : base.slice(0, MAX_RAIZ).replace(/-+$/, "");
  return [raiz, ...Array.from({ length: CANDIDATOS_DE_SLUG - 1 }, (_, i) => `${raiz}-${i + 2}`)];
}

export async function garantirConfig(tenantId: string): Promise<RastreioConfig> {
  const existente = await lerConfig(tenantId);
  if (existente) return existente;

  const { storeName } = await getOrganizationProfile(tenantId);
  for (const publicSlug of candidatosDeSlug(storeName)) {
    const { data, error } = await getSupabaseAdmin()
      .from(CONFIGS)
      .insert({ tenant_id: tenantId, public_slug: publicSlug })
      .select(COLUNAS);
    if (!error) {
      if (!data?.length) throw new Error("rastreio: a configuração não voltou do banco");
      return paraConfig(data[0] as Linha);
    }
    const qual = conflito(error);
    if (qual === "slug") continue;
    if (qual === "loja") {
      // Corrida: outra requisição criou a config da mesma loja.
      const criada = await lerConfig(tenantId);
      if (criada) return criada;
    }
    throw new Error(error.message);
  }
  throw new Error("rastreio: sem endereço livre para a loja");
}

async function gravar(tenantId: string, patch: Record<string, unknown>): Promise<RastreioConfig> {
  const { data, error } = await getSupabaseAdmin().from(CONFIGS).update(patch).eq("tenant_id", tenantId).select(COLUNAS);
  if (error) {
    if (conflito(error) === "slug") throw new SlugEmUso();
    throw new Error(error.message);
  }
  if (!data?.length) throw new Error("rastreio: configuração não encontrada");
  return paraConfig(data[0] as Linha);
}

export async function salvarConfig(
  tenantId: string,
  patch: Partial<Pick<RastreioConfig, "publicSlug" | "matrix" | "notifyStoreOnProblem" | "vipLinkId" | "storeWhatsapp">>,
): Promise<RastreioConfig> {
  return gravar(tenantId, {
    ...(patch.publicSlug !== undefined ? { public_slug: patch.publicSlug } : {}),
    ...(patch.matrix !== undefined ? { matrix: patch.matrix } : {}),
    ...(patch.notifyStoreOnProblem !== undefined ? { notify_store_on_problem: patch.notifyStoreOnProblem } : {}),
    ...(patch.vipLinkId !== undefined ? { vip_link_id: patch.vipLinkId } : {}),
    ...(patch.storeWhatsapp !== undefined ? { store_whatsapp: patch.storeWhatsapp } : {}),
    updated_at: new Date().toISOString(),
  });
}

/** Entrada da página pública: só devolve loja com o Rastreio ligado. */
export async function lojaPorSlug(slug: string): Promise<RastreioConfig | null> {
  const { data, error } = await getSupabaseAdmin().from(CONFIGS).select(COLUNAS).eq("public_slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const config = paraConfig(data as Linha);
  return (await rastreioLigado(config.tenantId)) ? config : null;
}

export async function marcarImportado(tenantId: string, em: Date): Promise<void> {
  await gravar(tenantId, { imported_at: em.toISOString() });
}

export async function avancarCursor(tenantId: string, cursor: string): Promise<void> {
  await gravar(tenantId, { sweep_cursor: cursor });
}
