import "server-only";

import type { AvisoParaEnviar, AvisoStatus, Canal, EtapaComAviso } from "@/lib/rastreio/tipos";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Avisos do Rastreio (`tracking_notices`), um por (pedido, etapa, canal). RLS sem policy e
 * service-role: o filtro `tenant_id` é a proteção real, e toda query leva o seu. A unicidade
 * (`order_id, etapa, channel`) é do banco: criar duas vezes é uma linha só.
 */

const AVISOS = "tracking_notices";
const COLUNAS = "id,order_id,etapa,channel,attempts,resends,message_id";

type Linha = {
  id: string;
  order_id: string;
  etapa: EtapaComAviso;
  channel: Canal;
  attempts: number;
  resends: number;
  message_id: string | null;
};

function paraAviso(l: Linha): AvisoParaEnviar {
  return {
    id: l.id,
    orderId: l.order_id,
    etapa: l.etapa,
    canal: l.channel,
    attempts: l.attempts,
    resends: l.resends,
    messageId: l.message_id,
  };
}

/** Insere o que falta; devolve só o que foi criado agora (o que já existia não volta). */
export async function criarAvisos(
  tenantId: string,
  orderId: string,
  etapa: EtapaComAviso,
  canais: Canal[],
): Promise<{ id: string; canal: Canal }[]> {
  if (canais.length === 0) return [];
  const { data, error } = await getSupabaseAdmin()
    .from(AVISOS)
    .upsert(
      canais.map((channel) => ({ tenant_id: tenantId, order_id: orderId, etapa, channel })),
      { onConflict: "order_id,etapa,channel", ignoreDuplicates: true },
    )
    .select("id,channel");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; channel: Canal }[]).map((l) => ({ id: l.id, canal: l.channel }));
}

/** Pendentes do canal, sem espera ou já vencidos, os mais velhos primeiro. */
export async function avisosParaEnviar(tenantId: string, canal: Canal, limite: number, agora: Date): Promise<AvisoParaEnviar[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(AVISOS)
    .select(COLUNAS)
    .eq("tenant_id", tenantId)
    .eq("channel", canal)
    .eq("status", "pendente")
    .or(`next_try_at.is.null,next_try_at.lte.${agora.toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(limite);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Linha[]).map(paraAviso);
}

/** Os que já saíram para a fila de envio e esperam o resultado. */
export async function avisosEnviando(tenantId: string, canal: Canal, limite: number): Promise<AvisoParaEnviar[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(AVISOS)
    .select(COLUNAS)
    .eq("tenant_id", tenantId)
    .eq("channel", canal)
    .eq("status", "enviando")
    .order("updated_at", { ascending: true })
    .limit(limite);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Linha[]).map(paraAviso);
}

/**
 * Grava só o que veio. `somarTentativa` lê `attempts` e grava +1: duas gravações simultâneas do mesmo
 * aviso somam uma, ao custo de uma retentativa a mais.
 */
export async function marcarAviso(
  tenantId: string,
  avisoId: string,
  patch: {
    status: AvisoStatus;
    error?: string | null;
    messageId?: string | null;
    nextTryAt?: string | null;
    somarTentativa?: boolean;
    sentAt?: string | null;
  },
): Promise<void> {
  const db = getSupabaseAdmin();
  let attempts: number | undefined;
  if (patch.somarTentativa) {
    const { data, error } = await db.from(AVISOS).select("attempts").eq("tenant_id", tenantId).eq("id", avisoId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("rastreio: aviso não encontrado");
    attempts = (data as { attempts: number }).attempts + 1;
  }
  const { data, error } = await db
    .from(AVISOS)
    .update({
      status: patch.status,
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(patch.messageId !== undefined ? { message_id: patch.messageId } : {}),
      ...(patch.nextTryAt !== undefined ? { next_try_at: patch.nextTryAt } : {}),
      ...(patch.sentAt !== undefined ? { sent_at: patch.sentAt } : {}),
      ...(attempts !== undefined ? { attempts } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", avisoId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("rastreio: aviso não encontrado");
}

/**
 * Reenvio: o que existe volta a `pendente` com `resends + 1`; o que falta é criado. O PATCH exige o
 * `resends` lido, então o segundo clique concorrente não acha a linha e não conta. Devolve quantos
 * avisos ficaram para sair agora.
 */
export async function reabrirAvisos(tenantId: string, orderId: string, etapa: EtapaComAviso, canais: Canal[]): Promise<number> {
  if (canais.length === 0) return 0;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from(AVISOS)
    .select("id,channel,resends")
    .eq("tenant_id", tenantId)
    .eq("order_id", orderId)
    .eq("etapa", etapa)
    .in("channel", canais);
  if (error) throw new Error(error.message);
  const existentes = (data ?? []) as { id: string; channel: Canal; resends: number }[];

  let reabertos = 0;
  for (const aviso of existentes) {
    const { data: voltou, error: erroDoPatch } = await db
      .from(AVISOS)
      .update({
        status: "pendente",
        resends: aviso.resends + 1,
        attempts: 0,
        message_id: null,
        error: null,
        next_try_at: null,
        sent_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("id", aviso.id)
      .eq("resends", aviso.resends)
      .select("id");
    if (erroDoPatch) throw new Error(erroDoPatch.message);
    if (voltou?.length) reabertos += 1;
  }

  const faltam = canais.filter((c) => !existentes.some((e) => e.channel === c));
  return reabertos + (await criarAvisos(tenantId, orderId, etapa, faltam)).length;
}
