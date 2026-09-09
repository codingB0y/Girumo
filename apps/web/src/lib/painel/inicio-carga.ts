import "server-only";

import { buildTenantDispatchList, type CampaignRef } from "@/lib/campaigns/dispatch-view";
import { campanhasColl, ensureSlugs } from "@/lib/campanhas-store";
import { listGroups as legacyListGroups } from "@/lib/groups-store";
import { collection } from "@/lib/json-collection";
import { listLeads as legacyListLeads } from "@/lib/leads-store";
import type { Schedule } from "@/lib/mock-data";
import { getSession, isLive } from "@/lib/session-store";
import { clickCounts, listLinks as legacyListLinks } from "@/lib/store";
import * as broadcastsStore from "@/lib/stores/broadcasts";
import * as campaignsStore from "@/lib/stores/campaign-groups";
import * as groupsStore from "@/lib/stores/groups";
import * as leadsStore from "@/lib/stores/leads";
import * as schedulesStore from "@/lib/stores/schedules";
import * as trackedLinksStore from "@/lib/stores/tracked-links";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import { apresentaIntegracoes } from "@/app/api/campanhas/apresenta";
import { readEntrada, readIntegracoes } from "@/lib/campaigns/settings";

/**
 * O corpo de dados de cada GET que a Inicio consome.
 *
 * Existe para que a rota agregada (`/api/painel/inicio`) e as dez rotas soltas
 * respondam a MESMA coisa: cada rota vira `resolve o tenant` + `Response.json`
 * de uma funcao daqui. Copiar os mapeamentos para a agregada criaria duas
 * verdades sobre o mesmo dado, que e como o valor do pedido virou 14990 na tela
 * e 149,90 no banco em 06/09.
 *
 * Nenhuma funcao aqui resolve tenant: quem resolve e o chamador, e resolver uma
 * vez em vez de dez e justamente o ponto da agregacao.
 */

/** Forma que o painel consome de `/api/groups` — camelCase do store JSON antigo. */
export async function carregarGrupos(tenantId: string) {
  if (!USE_SUPABASE) return legacyListGroups(tenantId);
  const grupos = await groupsStore.listGroups(tenantId);
  return grupos.map((g) => ({
    id: g.whatsapp_group_id,
    name: g.name,
    whatsappGroupId: g.whatsapp_group_id,
    members: g.members,
    capacity: g.capacity,
    selected: g.selected,
    engagement: g.engagement,
    isAdmin: g.is_admin ?? false,
    inviteUrl: g.invite_url,
    displayNameBase: g.display_name_base,
    displayNumber: g.display_number,
    sendState: g.send_state ?? null,
    // Idade do dado. `members` vem do último sync e não é atualizado quando um
    // cliente entra no grupo — a tela precisa poder dizer isso.
    syncedAt: g.admins_counted_at ?? null,
  }));
}

export async function carregarCampanhas(tenantId: string) {
  if (!USE_SUPABASE) {
    await ensureSlugs();
    return (await campanhasColl.list()).filter((item) => item.tenantId === tenantId);
  }
  const lista = await campaignsStore.listCampaignGroups(tenantId);
  return lista.map((c) => ({
    id: c.id,
    name: c.name,
    loja: (c.metadata as Record<string, unknown>)?.loja ?? "Minha loja",
    groupIds: c.group_ids,
    slug: c.slug,
    autoGrow: c.auto_grow,
    growTemplate: c.grow_template,
    settings: {
      entrada: readEntrada(c.metadata as Record<string, unknown>),
      integracoes: apresentaIntegracoes(readIntegracoes(c.metadata as Record<string, unknown>)),
    },
    createdAt: c.created_at,
  }));
}

export async function carregarLinks(tenantId: string) {
  if (!USE_SUPABASE) {
    const [links, counts] = await Promise.all([legacyListLinks(), clickCounts()]);
    return links
      .map((l) => ({ ...l, clicks: counts[l.slug] ?? 0 }))
      .sort((a, b) => b.clicks - a.clicks);
  }
  const links = await trackedLinksStore.listTrackedLinks(tenantId);
  return links
    .map((l) => ({
      id: l.id,
      slug: l.slug,
      destinationUrl: l.target_url,
      // Vínculo por ID: é o que sobrevive a renomear a campanha. `campaignName`
      // continua exposto só para os links antigos, que ainda não têm o ID.
      campaignGroupId: l.campaign_group_id,
      campaignName: (l.metadata as Record<string, unknown>)?.campaignName ?? "",
      targetGroupName: (l.metadata as Record<string, unknown>)?.targetGroupName ?? "",
      clicks: l.clicks,
      createdAt: l.created_at,
    }))
    .sort((a, b) => b.clicks - a.clicks);
}

/** Le `metadata.left_at` sem confiar na forma do jsonb. */
function readLeftAt(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).left_at;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * O painel consome a forma camelCase do store JSON antigo. Mapear aqui mantém
 * as telas intactas na troca de backend — mesmo padrão de `/api/groups`.
 */
export function leadParaOPainel(lead: leadsStore.Lead) {
  return {
    id: lead.id,
    name: lead.name ?? "Novo membro",
    phone: lead.phone ?? "",
    sourceGroup: lead.source_group_name ?? "",
    sourceGroupId: lead.source_group_id ?? undefined,
    sourceCampaign: lead.source_campaign ?? "—",
    status: lead.status,
    enteredAt: lead.entered_at,
    lastSeenAt: lead.last_seen_at ?? undefined,
    alsoIn: lead.also_in ?? [],
    // `metadata.left_at` e escrito pelo worker quando chega
    // `group-participants.update` com action "remove" (ver lead-capture).
    leftAt: readLeftAt(lead.metadata),
  };
}

export async function carregarLeads(tenantId: string, limit?: number) {
  if (!USE_SUPABASE) {
    const lista = await legacyListLeads(tenantId);
    return limit ? lista.slice(0, limit) : lista;
  }
  const leads = await leadsStore.listLeads(tenantId, limit);
  return leads.map(leadParaOPainel);
}

export async function carregarAgendamentos(tenantId: string) {
  if (!USE_SUPABASE) return collection<Schedule>("schedules.json").list();
  const lista = await schedulesStore.listSchedules(tenantId);
  return lista.map((s) => ({
    id: s.id,
    campaignId: s.broadcast_id ?? s.campaign_message_id,
    campaignName: s.name,
    scheduledAt: s.scheduled_at,
    recurrence: s.recurrence,
    status: s.status,
    lastRunAt: s.last_run_at,
  }));
}

/**
 * Sem Supabase não existe pipeline de broadcasts — a página mostra vazio em vez
 * de quebrar (o fallback JSON nunca teve disparo de verdade).
 */
export async function carregarDisparos(tenantId: string) {
  if (!USE_SUPABASE) return [];

  const [broadcasts, campaigns] = await Promise.all([
    broadcastsStore.listBroadcasts(tenantId),
    campaignsStore.listCampaignGroups(tenantId),
  ]);

  const schedules = await schedulesStore.listSchedulesByBroadcastIds(
    tenantId,
    broadcasts.map((b) => b.id),
  );

  const campaignById = new Map<string, CampaignRef>(
    campaigns.map((c) => [c.id, { name: c.name, slug: c.slug }]),
  );

  return buildTenantDispatchList(broadcasts, schedules, campaignById);
}

export async function carregarSessao(tenantId: string) {
  const s = await getSession(tenantId);
  return { ...s, live: isLive(s) };
}
