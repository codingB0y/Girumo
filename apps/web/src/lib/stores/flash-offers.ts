import "server-only";

import { mergeLidMaps } from "@/lib/relampago/lid-map";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Oferta Relâmpago. Supabase-only, sem o fallback JSON das stores antigas: com
 * dual-mode, tabela ausente não dá erro — cai no JSON em silêncio, e você
 * validaria em dev um caminho que não é o que roda em produção.
 *
 * Todo acesso filtra `tenant_id` explicitamente. O service-role bypassa RLS por
 * desenho, então esse filtro é a proteção real.
 */

export type OpenWindow = {
  offerId: string;
  groupId: string;
  keyword: string;
  openedAt: string;
  lidMap: Record<string, string>;
};

/**
 * A janela aberta deste grupo, se houver. É o quarto degrau do descarte do
 * receiver e o mais caro — por isso vem depois dos três degraus locais.
 */
export async function findOpenWindow(
  tenantId: string,
  whatsappGroupId: string,
): Promise<OpenWindow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("flash_offer_groups")
    .select("offer_id, group_id, opened_at, lid_map, flash_offers!inner(keyword, status)")
    .eq("tenant_id", tenantId)
    .eq("whatsapp_group_id", whatsappGroupId)
    .is("closed_at", null)
    .maybeSingle();

  if (error || !data) return null;

  const offer = data.flash_offers as unknown as { keyword: string; status: string };
  if (offer.status !== "open") return null;

  return {
    offerId: data.offer_id as string,
    groupId: data.group_id as string,
    keyword: offer.keyword,
    openedAt: data.opened_at as string,
    lidMap: (data.lid_map ?? {}) as Record<string, string>,
  };
}

export type EntryInsert = {
  tenantId: string;
  offerId: string;
  groupId: string;
  whatsappGroupId: string;
  participantJid: string;
  phone: string | null;
  pushName: string | null;
  messageText: string;
  messageId: string;
  commentedAt: Date;
};

/**
 * Grava o comentário. `false` quando um dos índices únicos recusou — reentrega
 * do webhook ou a mesma cliente comentando de novo. Não é erro: é a regra
 * funcionando, e por isso não sobe exceção.
 */
export async function insertEntry(input: EntryInsert): Promise<boolean> {
  const { error } = await getSupabaseAdmin().from("flash_offer_entries").insert({
    tenant_id: input.tenantId,
    offer_id: input.offerId,
    group_id: input.groupId,
    whatsapp_group_id: input.whatsappGroupId,
    participant_jid: input.participantJid,
    phone: input.phone,
    push_name: input.pushName,
    message_text: input.messageText,
    message_id: input.messageId,
    commented_at: input.commentedAt.toISOString(),
  });

  // 23505 = unique_violation.
  if (error && error.code !== "23505") throw error;
  return !error;
}

/**
 * Pares `@lid -> telefone` que já passaram pelo webhook.
 *
 * Todo `group-participants.update` guarda os participantes com `phoneNumber` ao
 * lado do `@lid`, e esses eventos estão em `engine_events` desde julho. São
 * milhares de pares de graça: em 30 dias, 3.390 dos 4.121 participantes vistos
 * traziam telefone. Não custa chamada nenhuma à Evolution.
 *
 * Só os últimos 90 dias: quem trocou de número tem o par novo no
 * `fetchAllGroups`, que vence este no merge.
 *
 * Passa por `mergeLidMaps` na saída porque aqui `phoneNumber` NÃO é dígito: em
 * produção chega como JID completo (`5511999998888@s.whatsapp.net`, 200/200 na
 * amostra de 01/09/2026). Sem normalizar, o mapa devolveria um JID no lugar do
 * telefone para quem chamasse esta função sem mesclar depois.
 */
export async function lidMapFromHistory(
  tenantId: string,
  whatsappGroupId: string,
): Promise<Record<string, string>> {
  const { data, error } = await getSupabaseAdmin()
    .from("engine_events")
    .select("payload")
    .eq("tenant_id", tenantId)
    .eq("type", "group-participants.update")
    .gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !data) return {};

  const mapa: Record<string, string> = {};

  for (const linha of data) {
    const evento = (linha.payload ?? {}) as { data?: { id?: string; participants?: unknown } };
    if (evento.data?.id !== whatsappGroupId) continue;

    for (const p of (evento.data?.participants ?? []) as Array<{
      id?: string;
      phoneNumber?: string;
    }>) {
      if (p?.id && p.phoneNumber && !(p.id in mapa)) mapa[p.id] = p.phoneNumber;
    }
  }

  return mergeLidMaps(mapa);
}
