import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * `yampi_events` (PR 1a): a caixa de entrada dos avisos, uma linha por `dedupe_key`. O `payload` tem dado
 * pessoal e vive 30 dias (`limparDadosVencidosComuns`).
 */

const TABLE = "yampi_events";
const COLS = "id, tenant_id, connection_id, event, resource_id, payload, received_at, processed_at, error";
const TETO_DO_ERRO = 300;

type Linha = {
  id: string;
  tenant_id: string;
  connection_id: string;
  event: string;
  resource_id: string | null;
  payload: unknown;
  received_at: string;
  processed_at: string | null;
  error: string | null;
};

export type EventoYampiGravado = {
  id: string;
  tenantId: string;
  connectionId: string;
  event: string;
  resourceId: string | null;
  payload: unknown;
  receivedAt: string;
  processedAt: string | null;
  error: string | null;
};

/** null = a `dedupe_key` já existia (aviso repetido): nada entrou. */
export async function gravarEventoYampi(e: {
  tenantId: string;
  connectionId: string;
  event: string;
  resourceId: string | null;
  dedupeKey: string;
  payload: unknown;
}): Promise<{ id: string } | null> {
  const linha = {
    tenant_id: e.tenantId,
    connection_id: e.connectionId,
    event: e.event,
    resource_id: e.resourceId,
    dedupe_key: e.dedupeKey,
    payload: e.payload,
  };
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(linha, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  const gravada = (data as Array<{ id: string }> | null)?.[0];
  return gravada ? { id: gravada.id } : null;
}

/** Por id, sem loja: o `after()` e o cron só têm o id; a loja vem da linha. */
export async function lerEventoYampi(id: string): Promise<EventoYampiGravado | null> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).select(COLS).eq("id", id).limit(1);
  if (error) throw new Error(error.message);
  const l = (data as Linha[] | null)?.[0];
  if (!l) return null;
  return {
    id: l.id,
    tenantId: l.tenant_id,
    connectionId: l.connection_id,
    event: l.event,
    resourceId: l.resource_id,
    payload: l.payload,
    receivedAt: l.received_at,
    processedAt: l.processed_at,
    error: l.error,
  };
}

/** `nota` explica um processado sem consumidor (conexão ausente, envelope inválido); some quando é null. */
export async function marcarEventoProcessado(tenantId: string, id: string, nota?: string | null): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ processed_at: new Date().toISOString(), error: nota ? nota.slice(0, TETO_DO_ERRO) : null })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

/** Fica sem `processed_at`: o cron tenta de novo. */
export async function marcarEventoComErro(tenantId: string, id: string, erro: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ error: erro.slice(0, TETO_DO_ERRO) })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

/** Sem loja, de propósito: o cron descobre os parados de todas. Os mais antigos primeiro. */
export async function listarEventosParados(p: { antesDe: Date; depoisDe: Date; limite: number }): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id")
    .is("processed_at", null)
    .lt("received_at", p.antesDe.toISOString())
    .gt("received_at", p.depoisDe.toISOString())
    .order("received_at", { ascending: true })
    .limit(p.limite);
  if (error) throw new Error(error.message);
  return ((data as Array<{ id: string }> | null) ?? []).map((l) => l.id);
}

/** Retenção da base comum (PR 1a): avisos com mais de 30 dias e conversas paradas há 180. Devolve o apagado. */
export async function limparDadosVencidosComuns(): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc("limpar_dados_vencidos_comuns");
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
