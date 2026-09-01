import "server-only";

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
