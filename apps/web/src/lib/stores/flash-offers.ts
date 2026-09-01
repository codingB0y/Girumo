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

export type OfferRow = {
  id: string;
  tenant_id: string;
  name: string;
  keyword: string;
  slots: number;
  timer_seconds: number | null;
  status: "draft" | "open" | "closed";
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
};

export type QueueEntry = {
  id: string;
  participant_jid: string;
  phone: string | null;
  push_name: string | null;
  message_text: string;
  commented_at: string;
  deprioritized_at: string | null;
  outcome: "sold" | "dropped" | null;
  claim: {
    id: string;
    seller_user_id: string;
    claimed_at: string;
    contacted_at: string | null;
  } | null;
};

export async function listOffers(tenantId: string): Promise<OfferRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("flash_offers")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as OfferRow[];
}

export async function getOffer(tenantId: string, offerId: string): Promise<OfferRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("flash_offers")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", offerId)
    .maybeSingle();

  if (error) throw error;
  return (data as OfferRow) ?? null;
}

/**
 * Recicla o que venceu ANTES de servir a fila. É o que substitui o cron: quem lê
 * é quem recicla. A tela dá poll de qualquer forma.
 */
export async function releaseExpired(tenantId: string, offerId: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc("release_expired_flash_claims", {
    p_tenant: tenantId,
    p_offer: offerId,
  });

  if (error) throw error;
  return (data as number) ?? 0;
}

/** A fila na ordem. `commented_at` nunca é reescrito — é a prova. */
export async function listQueue(tenantId: string, offerId: string): Promise<QueueEntry[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("flash_offer_entries")
    .select(
      "id, participant_jid, phone, push_name, message_text, commented_at, deprioritized_at, outcome, flash_offer_claims(id, seller_user_id, claimed_at, contacted_at, released_at)",
    )
    .eq("tenant_id", tenantId)
    .eq("offer_id", offerId)
    .order("deprioritized_at", { ascending: true, nullsFirst: true })
    .order("commented_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((linha) => {
    const claims = (linha.flash_offer_claims ?? []) as Array<{
      id: string;
      seller_user_id: string;
      claimed_at: string;
      contacted_at: string | null;
      released_at: string | null;
    }>;
    const ativo = claims.find((c) => c.released_at === null) ?? null;

    return {
      id: linha.id as string,
      participant_jid: linha.participant_jid as string,
      phone: linha.phone as string | null,
      push_name: linha.push_name as string | null,
      message_text: linha.message_text as string,
      commented_at: linha.commented_at as string,
      deprioritized_at: linha.deprioritized_at as string | null,
      outcome: linha.outcome as "sold" | "dropped" | null,
      claim: ativo
        ? {
            id: ativo.id,
            seller_user_id: ativo.seller_user_id,
            claimed_at: ativo.claimed_at,
            contacted_at: ativo.contacted_at,
          }
        : null,
    };
  });
}

export type ClaimResult =
  | { ok: true; claimId: string; entryId: string }
  | { ok: false; motivo: "sem_vaga" | "fila_vazia" | "oferta_fechada" };

/**
 * Pega a próxima da fila. O teto de `slots` é conferido DENTRO da RPC: conferir
 * na rota e inserir depois deixaria duas vendedoras clicando juntas passarem do
 * estoque.
 */
export async function claimNext(
  tenantId: string,
  offerId: string,
  sellerUserId: string,
): Promise<ClaimResult> {
  const { data, error } = await getSupabaseAdmin().rpc("claim_next_flash_entry", {
    p_tenant: tenantId,
    p_offer: offerId,
    p_seller: sellerUserId,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("sem vaga")) return { ok: false, motivo: "sem_vaga" };
    if (msg.includes("fila vazia")) return { ok: false, motivo: "fila_vazia" };
    if (msg.includes("nao esta aberta")) return { ok: false, motivo: "oferta_fechada" };
    // 23505: outra vendedora ganhou a corrida na MESMA cliente. Não é erro de
    // sistema — a tela recarrega e ela clica de novo.
    if (error.code === "23505") return { ok: false, motivo: "fila_vazia" };
    throw error;
  }

  const claim = data as { id: string; entry_id: string };
  return { ok: true, claimId: claim.id, entryId: claim.entry_id };
}

/** Clicar em "Chamar no WhatsApp" larga o cronômetro. Idempotente. */
export async function markContacted(tenantId: string, claimId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("flash_offer_claims")
    .update({ contacted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", claimId)
    .is("contacted_at", null)
    .is("released_at", null);

  if (error) throw error;
}

/**
 * Fecha a reserva com desfecho. `sold` consome uma vaga para sempre; `dropped`
 * devolve a vaga e encerra a entrada.
 */
export async function settleClaim(
  tenantId: string,
  claimId: string,
  outcome: "sold" | "dropped",
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const agora = new Date().toISOString();

  const { data: claim, error: erroClaim } = await supabase
    .from("flash_offer_claims")
    .update({ released_at: agora, release_reason: outcome, updated_at: agora })
    .eq("tenant_id", tenantId)
    .eq("id", claimId)
    .is("released_at", null)
    .select("entry_id")
    .maybeSingle();

  if (erroClaim) throw erroClaim;
  if (!claim) return; // já fechada: no-op

  const { error: erroEntry } = await supabase
    .from("flash_offer_entries")
    .update({ outcome, updated_at: agora })
    .eq("tenant_id", tenantId)
    .eq("id", claim.entry_id);

  if (erroEntry) throw erroEntry;
}

/** Fecha a oferta e libera os grupos para a próxima. */
export async function closeOffer(tenantId: string, offerId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const agora = new Date().toISOString();

  const { error: erroOferta } = await supabase
    .from("flash_offers")
    .update({ status: "closed", closed_at: agora, updated_at: agora })
    .eq("tenant_id", tenantId)
    .eq("id", offerId);

  if (erroOferta) throw erroOferta;

  // Sem isto o índice único continua bloqueando o grupo para sempre.
  const { error: erroGrupos } = await supabase
    .from("flash_offer_groups")
    .update({ closed_at: agora })
    .eq("tenant_id", tenantId)
    .eq("offer_id", offerId)
    .is("closed_at", null);

  if (erroGrupos) throw erroGrupos;
}
