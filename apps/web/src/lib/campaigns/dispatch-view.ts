/**
 * Traduz o par (broadcast, schedule) para a forma que a aba Mensagens já
 * consome — função PURA, sem I/O.
 *
 * Contexto: a aba foi escrita contra `campaign_messages`, tabela que NINGUÉM
 * consumia (o clique dizia "enviado" e nada saía). O disparo de verdade é
 * `broadcasts` + fan-out + worker. Em vez de reescrever a UI, o backend passa a
 * ler broadcasts e devolver o mesmo contrato.
 */

export type DispatchStatus = "draft" | "scheduled" | "queued" | "running" | "sent" | "failed";
export type DispatchType = "text" | "image" | "video" | "audio" | "file" | "poll";
export type DispatchRecurrence = "none" | "daily" | "weekly";

export type BroadcastRow = {
  id: string;
  campaign_group_id: string | null;
  name: string;
  message: string;
  group_ids: string[];
  media_id: string | null;
  media_type: string | null;
  media_name?: string | null;
  mention_all: boolean;
  poll: { question: string; options: string[] } | null;
  status: "draft" | "queued" | "running" | "sent" | "failed";
  sent: number;
  total: number;
  error: string | null;
  dispatched_at: string | null;
  running_since: string | null;
  last_ack_at: string | null;
  created_at: string;
};

export type ScheduleRow = {
  id: string;
  broadcast_id: string | null;
  scheduled_at: string;
  recurrence: DispatchRecurrence;
  status: "pending" | "running" | "done" | "failed";
};

export type DispatchView = {
  id: string;
  campaignId: string | null;
  campaignSlug: string;
  type: DispatchType;
  body: string;
  groupIds: string[];
  mediaId?: string;
  mediaType?: "image" | "video" | "audio" | "file";
  mediaName?: string;
  poll?: { question: string; options: string[] };
  mentionAll: boolean;
  scheduledAt?: string;
  recurrence: DispatchRecurrence;
  status: DispatchStatus;
  sent: number;
  total: number;
  error?: string;
  createdAt: string;
  dispatchedAt?: string;
  runningSince?: string;
  lastAckAt?: string;
  /** Agendamento que ainda vai promover este broadcast (usado p/ cancelar). */
  scheduleId?: string;
};

const MEDIA_TYPES = ["image", "video", "audio", "file"] as const;

/** `broadcasts` não guarda "tipo": ele sai do conteúdo, igual à aba fazia. */
export function resolveDispatchType(b: Pick<BroadcastRow, "poll" | "media_type" | "media_id">): DispatchType {
  if (b.poll) return "poll";
  const media = (MEDIA_TYPES as readonly string[]).includes(String(b.media_type)) ? b.media_type : null;
  if (media) return media as DispatchType;
  return b.media_id ? "image" : "text";
}

function normalizeMediaType(raw: string | null | undefined): DispatchView["mediaType"] {
  return (MEDIA_TYPES as readonly string[]).includes(String(raw))
    ? (raw as DispatchView["mediaType"])
    : undefined;
}

/**
 * Status exibido. Um broadcast ainda em `draft` com agendamento PENDENTE aparece
 * como "scheduled" — é o estado que o lojista entende, e é o que a agenda espera.
 */
export function toDispatchView(
  broadcast: BroadcastRow,
  campaignSlug: string,
  schedule: ScheduleRow | null,
): DispatchView {
  const pendingSchedule = schedule && schedule.status === "pending" ? schedule : null;
  return {
    id: broadcast.id,
    campaignId: broadcast.campaign_group_id,
    campaignSlug,
    type: resolveDispatchType(broadcast),
    body: broadcast.message,
    groupIds: broadcast.group_ids,
    mediaId: broadcast.media_id ?? undefined,
    mediaType: normalizeMediaType(broadcast.media_type),
    mediaName: broadcast.media_name ?? undefined,
    poll: broadcast.poll ?? undefined,
    mentionAll: broadcast.mention_all,
    scheduledAt: pendingSchedule?.scheduled_at,
    recurrence: pendingSchedule?.recurrence ?? "none",
    status: pendingSchedule && broadcast.status === "draft" ? "scheduled" : broadcast.status,
    sent: broadcast.sent,
    total: broadcast.total,
    error: broadcast.error ?? undefined,
    createdAt: broadcast.created_at,
    dispatchedAt: broadcast.dispatched_at ?? undefined,
    runningSince: broadcast.running_since ?? undefined,
    lastAckAt: broadcast.last_ack_at ?? undefined,
    scheduleId: pendingSchedule?.id,
  };
}

/** Indexa agendamentos por broadcast, mantendo o pendente mais próximo. */
export function indexSchedulesByBroadcast(schedules: readonly ScheduleRow[]): Map<string, ScheduleRow> {
  const byBroadcast = new Map<string, ScheduleRow>();
  for (const s of schedules) {
    if (!s.broadcast_id) continue;
    const current = byBroadcast.get(s.broadcast_id);
    // Pendente ganha de qualquer outro; entre dois pendentes, o mais cedo.
    if (!current) {
      byBroadcast.set(s.broadcast_id, s);
      continue;
    }
    const currentPending = current.status === "pending";
    const nextPending = s.status === "pending";
    if (nextPending && !currentPending) byBroadcast.set(s.broadcast_id, s);
    else if (nextPending === currentPending && s.scheduled_at < current.scheduled_at) {
      byBroadcast.set(s.broadcast_id, s);
    }
  }
  return byBroadcast;
}

/** Ordena por criação, mais recente primeiro. */
function byCreatedAtDesc(a: DispatchView, b: DispatchView): number {
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

/** Lista da aba: mais recentes primeiro, com o agendamento de cada um resolvido. */
export function buildDispatchList(
  broadcasts: readonly BroadcastRow[],
  schedules: readonly ScheduleRow[],
  campaignSlug: string,
): DispatchView[] {
  const byBroadcast = indexSchedulesByBroadcast(schedules);
  return broadcasts
    .map((b) => toDispatchView(b, campaignSlug, byBroadcast.get(b.id) ?? null))
    .sort(byCreatedAtDesc);
}

export type CampaignRef = { name: string; slug: string };

/** Um disparo na visão do tenant inteiro: precisa dizer de QUAL campanha veio. */
export type TenantDispatchView = DispatchView & { campaignName: string };

/**
 * Lista da página /painel/disparos — todos os disparos do tenant, de todas as
 * campanhas. Diferente de `buildDispatchList`, cada linha resolve a própria
 * campanha; disparo cuja campanha sumiu continua aparecendo (com rótulo
 * neutro) em vez de desaparecer do histórico sem explicação.
 */
export function buildTenantDispatchList(
  broadcasts: readonly BroadcastRow[],
  schedules: readonly ScheduleRow[],
  campaignById: ReadonlyMap<string, CampaignRef>,
): TenantDispatchView[] {
  const byBroadcast = indexSchedulesByBroadcast(schedules);
  return broadcasts
    .map((b) => {
      const campaign = b.campaign_group_id ? campaignById.get(b.campaign_group_id) : undefined;
      return {
        ...toDispatchView(b, campaign?.slug ?? "", byBroadcast.get(b.id) ?? null),
        campaignName: campaign?.name ?? "Campanha removida",
      };
    })
    .sort(byCreatedAtDesc);
}
