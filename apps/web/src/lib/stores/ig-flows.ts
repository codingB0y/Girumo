import "server-only";

import type { RecipeId } from "@/lib/ig/flow/recipes";
import type { FlowDef } from "@/lib/ig/flow/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Fluxos do Instagram. Supabase-only, sem fallback JSON. Todo acesso filtra
 * `tenant_id`: o service-role bypassa RLS, então o filtro é a proteção real.
 */
export type FlowStatus = "draft" | "live" | "paused";

export type FlowRow = {
  id: string;
  tenant_id: string;
  ig_account_id: string | null;
  name: string;
  recipe: RecipeId;
  status: FlowStatus;
  draft: FlowDef;
  published: FlowDef | null;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FlowSummary = Pick<FlowRow, "id" | "name" | "recipe" | "status" | "version" | "updated_at" | "published_at">;

const COLS = "id, tenant_id, ig_account_id, name, recipe, status, draft, published, version, published_at, created_at, updated_at";
const SUMMARY_COLS = "id, name, recipe, status, version, updated_at, published_at";

export async function listFlows(tenantId: string): Promise<FlowSummary[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_flows")
    .select(SUMMARY_COLS)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FlowSummary[];
}

export async function getFlow(tenantId: string, id: string): Promise<FlowRow | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_flows").select(COLS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as FlowRow | null) ?? null;
}

export async function createFlow(tenantId: string, input: { name: string; recipe: RecipeId; draft: FlowDef }): Promise<FlowRow> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_flows")
    .insert({ tenant_id: tenantId, name: input.name, recipe: input.recipe, draft: input.draft })
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as FlowRow;
}

/** Só o rascunho muda aqui; o publicado só muda em `publishFlow`. */
export async function updateDraft(tenantId: string, id: string, input: { name?: string; draft?: FlowDef }): Promise<FlowRow | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.draft !== undefined) patch.draft = input.draft;
  const { data, error } = await getSupabaseAdmin().from("ig_flows").update(patch).eq("tenant_id", tenantId).eq("id", id).select(COLS).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as FlowRow | null) ?? null;
}

export async function deleteFlow(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("ig_flows").delete().eq("tenant_id", tenantId).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * Grava o grafo validado em `published`, sobe a versão e põe o fluxo no ar. NÃO
 * toca `draft`: o `.eq("version")` só trava publicações concorrentes (duas abas
 * publicando, só uma ganha); edição de rascunho não sobe a versão, então reescrever
 * `draft` aqui apagaria um autosave que chegou no meio.
 */
export async function publishFlow(tenantId: string, id: string, def: FlowDef, fromVersion: number): Promise<FlowRow | null> {
  const agora = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("ig_flows")
    .update({ published: def, status: "live", version: fromVersion + 1, published_at: agora, updated_at: agora })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("version", fromVersion)
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as FlowRow | null) ?? null;
}

/** Os fluxos no ar, com o grafo publicado: é de onde saem as palavras em uso. */
export async function listLiveFlows(tenantId: string): Promise<Pick<FlowRow, "id" | "published">[]> {
  const { data, error } = await getSupabaseAdmin().from("ig_flows").select("id, published").eq("tenant_id", tenantId).eq("status", "live");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Pick<FlowRow, "id" | "published">[];
}

/** Ao desconectar a conta: nada fica no ar sem conta. */
export async function pauseLiveFlows(tenantId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("ig_flows").update({ status: "paused", updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("status", "live");
  if (error) throw new Error(error.message);
}
