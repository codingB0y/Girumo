import "server-only";
import { collection } from "@/lib/json-collection";
import { enqueueDispatch } from "@/lib/dispatch-store";

export type MessageType = "text" | "image" | "video" | "audio" | "file" | "poll";
export type MessageStatus = "draft" | "scheduled" | "queued" | "running" | "sent" | "failed";

export type CampaignMessage = {
  id: string;
  /** ID da campanha-mãe (campanhas.json) */
  campaignId: string;
  campaignSlug: string;
  /** Tipo principal do conteúdo */
  type: MessageType;
  /** Texto da mensagem (ou legenda se tiver mídia) */
  body: string;
  /** IDs dos grupos alvo (herda da campanha se vazio) */
  groupIds: string[];
  /** Mídia anexada */
  mediaId?: string;
  mediaType?: "image" | "video" | "audio" | "file";
  /** Nome original do arquivo (p/ exibição) */
  mediaName?: string;
  /** Enquete */
  poll?: { question: string; options: string[] };
  /** Mencionar todos do grupo */
  mentionAll: boolean;
  /** Se preenchido, é agendamento */
  scheduledAt?: string;
  /** Recorrência do agendamento */
  recurrence: "none" | "daily" | "weekly";
  /** Status do envio */
  status: MessageStatus;
  /** Contadores de progresso */
  sent: number;
  total: number;
  /** Erro do último disparo */
  error?: string;
  /** Timestamps */
  createdAt: string;
  dispatchedAt?: string;
  runningSince?: string;
  lastAckAt?: string;
};

const coll = collection<CampaignMessage>("messages.json");

export { coll as messagesCollection };

/** Lista mensagens de uma campanha específica */
export async function listByCampaign(campaignId: string): Promise<CampaignMessage[]> {
  const all = await coll.list();
  return all.filter((m) => m.campaignId === campaignId);
}

/** Lista mensagens agendadas (pendentes) de todas as campanhas */
export async function listScheduled(): Promise<CampaignMessage[]> {
  const all = await coll.list();
  return all.filter((m) => m.status === "scheduled");
}

/** Cria uma mensagem e, se não for agendamento, enfileira pra dispatch */
export async function createMessage(
  input: Omit<CampaignMessage, "id" | "status" | "sent" | "total" | "createdAt" | "dispatchedAt" | "runningSince" | "lastAckAt" | "error">,
): Promise<CampaignMessage> {
  const isScheduled = Boolean(input.scheduledAt);
  const msg = await coll.create({
    ...input,
    status: isScheduled ? "scheduled" : "draft",
    sent: 0,
    total: input.groupIds.length,
    createdAt: new Date().toISOString(),
  });

  // Se envio imediato: sincroniza com broadcasts.json e enfileira
  if (!isScheduled) {
    await syncToBroadcastAndDispatch(msg);
  }

  return msg;
}

/** Sincroniza a mensagem com o sistema de dispatch existente (broadcasts.json) */
async function syncToBroadcastAndDispatch(msg: CampaignMessage): Promise<void> {
  const { collection: broadcastColl } = await import("@/lib/json-collection");
  const broadcasts = broadcastColl<import("@/lib/mock-data").Campaign>("broadcasts.json");

  // Cria broadcast espelho com o mesmo ID
  await broadcasts.create({
    id: msg.id,
    name: `[${msg.campaignSlug}] ${msg.body.slice(0, 40)}`,
    message: msg.body,
    groupIds: msg.groupIds,
    mediaId: msg.mediaId,
    mediaType: msg.mediaType === "image" || msg.mediaType === "video" ? msg.mediaType : undefined,
    mentionAll: msg.mentionAll,
    poll: msg.poll,
    status: "draft",
    sent: 0,
    total: msg.groupIds.length,
    createdAt: msg.createdAt,
  });

  // Enfileira para a engine
  await enqueueDispatch(msg.id);

  // Atualiza status local
  await coll.update(msg.id, { status: "queued" });
}

/** Promove mensagens agendadas vencidas para dispatch */
export async function processDueMessages(): Promise<void> {
  const all = await coll.list();
  const now = Date.now();
  const DAY_MS = 86_400_000;

  for (const m of all) {
    if (m.status !== "scheduled") continue;
    if (!m.scheduledAt || new Date(m.scheduledAt).getTime() > now) continue;

    // Disparar
    await syncToBroadcastAndDispatch(m);

    // Se recorrente, reprograma; senão, marca como concluído quando dispatch terminar
    if (m.recurrence !== "none") {
      const step = m.recurrence === "daily" ? DAY_MS : 7 * DAY_MS;
      let next = new Date(m.scheduledAt).getTime();
      do { next += step; } while (next <= now);
      await coll.update(m.id, {
        scheduledAt: new Date(next).toISOString(),
        status: "scheduled",
      });
    }
  }
}

/** Cancela um agendamento */
export async function cancelMessage(id: string): Promise<CampaignMessage | null> {
  return coll.update(id, { status: "draft" });
}

/** Remove uma mensagem (apenas draft/failed/sent) */
export async function removeMessage(id: string): Promise<boolean> {
  const all = await coll.list();
  const msg = all.find((m) => m.id === id);
  if (!msg) return false;
  if (msg.status === "queued" || msg.status === "running") return false; // não pode remover em andamento
  await coll.remove(id);
  return true;
}
