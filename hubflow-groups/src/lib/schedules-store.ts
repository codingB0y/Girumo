import "server-only";
import { collection } from "@/lib/json-collection";
import { enqueueDispatch } from "@/lib/dispatch-store";
import type { Schedule } from "@/lib/mock-data";

const coll = collection<Schedule>("schedules.json");
const DAY_MS = 86_400_000;

/** Avança um horário pela recorrência até cair no futuro (cobre execuções perdidas). */
function nextOccurrence(from: Date, rec: "daily" | "weekly", now: number): Date {
  const step = rec === "daily" ? DAY_MS : 7 * DAY_MS;
  let t = from.getTime();
  do {
    t += step;
  } while (t <= now);
  return new Date(t);
}

/**
 * Promove os agendamentos VENCIDOS (scheduledAt <= agora, status pending) para a
 * fila de disparo: enfileira a oferta vinculada e, conforme a recorrência, conclui
 * (única) ou reprograma para a próxima ocorrência. Chamado quando a engine puxa a
 * fila — sem timer dedicado. Idempotente: só age em quem está pending e vencido.
 */
export async function processDueSchedules(): Promise<void> {
  const list = await coll.list();
  const now = Date.now();
  for (const s of list) {
    if (s.status !== "pending") continue;
    if (new Date(s.scheduledAt).getTime() > now) continue;

    // Sem oferta vinculada não há o que disparar.
    const enqueued = s.campaignId ? await enqueueDispatch(s.campaignId) : null;
    if (!enqueued) {
      await coll.update(s.id, { status: "failed" });
      continue;
    }

    if (s.recurrence === "none") {
      await coll.update(s.id, { status: "done", lastRunAt: new Date(now).toISOString() });
    } else {
      await coll.update(s.id, {
        scheduledAt: nextOccurrence(new Date(s.scheduledAt), s.recurrence, now).toISOString(),
        lastRunAt: new Date(now).toISOString(),
      });
    }
  }
}
