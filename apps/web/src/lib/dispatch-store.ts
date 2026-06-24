import "server-only";
import { collection } from "@/lib/json-collection";
import type { Campaign } from "@/lib/mock-data";

// O motor de disparo reutiliza a coleção de ofertas (broadcasts.json) como fila.
// Estados relevantes ao disparo:
//   draft/failed/sent  → parado (pode ser (re)enfileirado)
//   queued             → o lojista mandou enviar; aguardando a engine puxar
//   running            → a engine claimou e está disparando pela fila anti-ban
const coll = collection<Campaign>("broadcasts.json");

export type DispatchJob = {
  id: string;
  name: string;
  message: string;
  groupIds: string[];
  mediaId?: string;
  mediaType?: "image" | "video";
  mentionAll?: boolean;
  poll?: { question: string; options: string[] };
};

// Job preso: "running" sem ack há mais que isto → a engine provavelmente caiu.
// Marcamos como "failed" (não re-enfileira sozinho p/ NÃO arriscar disparo duplo).
const STALE_RUNNING_MS = 15 * 60_000;

/** Lojista pediu "Enviar agora": coloca a oferta na fila para a engine puxar. */
export async function enqueueDispatch(id: string): Promise<Campaign | null> {
  return coll.transact<Campaign | null>((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { result: null };
    if (c.status === "queued" || c.status === "running") return { result: c }; // já na fila/rodando
    Object.assign(c, {
      status: "queued",
      sent: 0,
      total: c.groupIds.length, // 1 msg por grupo (0 = "todos", a engine preenche)
      error: undefined,
      dispatchedAt: undefined,
      runningSince: undefined,
      lastAckAt: undefined,
    });
    return { items: list, result: c };
  });
}

/**
 * A engine reivindica (claim) as ofertas enfileiradas numa ÚNICA transação
 * atômica (sob lock do arquivo): evita disparo duplicado. No mesmo passo,
 * recupera jobs "running" presos (engine caiu) marcando-os como "failed".
 */
export async function claimPending(): Promise<DispatchJob[]> {
  return coll.transact<DispatchJob[]>((list) => {
    const now = Date.now();
    let changed = false;

    // 1) Recupera jobs presos em "running" (sem ack recente).
    for (const c of list) {
      if (c.status !== "running") continue;
      const ref = c.lastAckAt ?? c.runningSince;
      if (ref && now - new Date(ref).getTime() > STALE_RUNNING_MS) {
        c.status = "failed";
        c.error = "Disparo interrompido (engine desconectou). Envie de novo.";
        changed = true;
      }
    }

    // 2) Claim das enfileiradas → running.
    const queued = list.filter((c) => c.status === "queued");
    for (const c of queued) {
      c.status = "running";
      c.runningSince = new Date(now).toISOString();
      c.lastAckAt = c.runningSince;
      changed = true;
    }

    return {
      items: changed ? list : undefined,
      result: queued.map((c) => ({ id: c.id, name: c.name, message: c.message, groupIds: c.groupIds, mediaId: c.mediaId, mediaType: c.mediaType, mentionAll: c.mentionAll, poll: c.poll })),
    };
  });
}

/** A engine reporta o resultado/progresso de um disparo. */
export async function ackDispatch(input: {
  id: string;
  status: "running" | "sent" | "failed";
  sent: number;
  total: number;
  error?: string | null;
}): Promise<Campaign | null> {
  const nowIso = new Date().toISOString();
  return coll.update(input.id, {
    status: input.status,
    sent: input.sent,
    total: input.total,
    error: input.error ?? undefined,
    lastAckAt: nowIso,
    ...(input.status === "sent" || input.status === "failed" ? { dispatchedAt: nowIso } : {}),
  });
}
