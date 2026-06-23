import "server-only";
import { collection } from "@/lib/json-collection";
import { campanhasColl, type Campanha } from "@/lib/campanhas-store";
import { listGroups, upsertGroup } from "@/lib/groups-store";

// Fila de criação de grupo (auto-grow). Espelha o motor de disparo:
//   queued → enfileirado, aguardando a engine puxar
//   running → engine claimou e está criando no WhatsApp
//   created → engine criou; grupo registrado no pool e o /r/<campanha> já o roteia
//   failed  → criação falhou (ou job preso recuperado)
const coll = collection<GrowJob>("group-grow.json");

export type GrowJobStatus = "queued" | "running" | "created" | "failed";

export type GrowJob = {
  id: string;
  campanhaId: string;
  campaignSlug: string;
  subject: string;
  desc?: string;
  mediaId?: string;
  announce: boolean;
  memberAddMode: "admin_add" | "all_member_add";
  status: GrowJobStatus;
  /** Preenchidos no ack `created`. */
  whatsappGroupId?: string;
  inviteLink?: string;
  error?: string;
  createdAt: string;
  runningSince?: string;
  lastAckAt?: string;
};

// Job preso em "running" sem ack há mais que isto → "failed" (engine caiu).
const STALE_RUNNING_MS = 15 * 60_000;
// Proativo: cria o próximo grupo quando NENHUM grupo do pool está abaixo deste enchimento.
const GROW_AHEAD_RATIO = 0.9;

// Só os campos que a engine precisa p/ criar o grupo.
export type GrowClaim = Pick<
  GrowJob,
  "id" | "campaignSlug" | "subject" | "desc" | "mediaId" | "announce" | "memberAddMode"
>;

/**
 * Proativo a 90%: p/ cada campanha com autoGrow, se o pool não tem mais nenhum grupo com
 * folga (convite + members < 90% cap) e não há job em andamento, enfileira a criação do próximo.
 * Chamado quando a engine puxa a fila — sem timer.
 */
export async function evaluateAutoGrow(): Promise<void> {
  const [campanhas, groups, jobs] = await Promise.all([
    campanhasColl.list(),
    listGroups(),
    coll.list(),
  ]);
  const byId = new Map(groups.map((g) => [g.whatsappGroupId, g]));
  for (const c of campanhas) {
    if (!c.autoGrow || !c.growTemplate?.subjectPattern) continue;
    // Não empilha: já existe job em andamento p/ esta campanha?
    if (jobs.some((j) => j.campanhaId === c.id && (j.status === "queued" || j.status === "running"))) continue;
    // Ainda há grupo com folga (< 90%)? então não precisa criar.
    const hasHeadroom = c.groupIds.some((id) => {
      const g = byId.get(id);
      return !!g && !!g.inviteUrl && g.members < g.capacity * GROW_AHEAD_RATIO;
    });
    if (hasHeadroom) continue;
    await enqueueGrow(c);
  }
}

/** Enfileira 1 job de criação p/ a campanha, numerando o nome pelo growCounter. */
async function enqueueGrow(c: Campanha): Promise<void> {
  const t = c.growTemplate!;
  const n = (c.growCounter ?? c.groupIds.length) + 1;
  const subject = t.subjectPattern.includes("{n}")
    ? t.subjectPattern.replace("{n}", String(n))
    : `${t.subjectPattern} ${n}`;
  await coll.create({
    campanhaId: c.id,
    campaignSlug: c.slug ?? "",
    subject,
    desc: t.desc,
    mediaId: t.mediaId,
    announce: t.announce ?? true,
    memberAddMode: t.memberAddMode ?? "admin_add",
    status: "queued",
    createdAt: new Date().toISOString(),
  } as Omit<GrowJob, "id">);
  await campanhasColl.update(c.id, { growCounter: n });
}

/**
 * A engine reivindica os jobs enfileirados numa transação atômica (sem criação dupla) e,
 * no mesmo passo, recupera jobs "running" presos (engine caiu) → "failed".
 */
export async function claimGrow(): Promise<GrowClaim[]> {
  return coll.transact<GrowClaim[]>((list) => {
    const now = Date.now();
    let changed = false;
    for (const j of list) {
      if (j.status !== "running") continue;
      const ref = j.lastAckAt ?? j.runningSince;
      if (ref && now - new Date(ref).getTime() > STALE_RUNNING_MS) {
        j.status = "failed";
        j.error = "Criação interrompida (engine desconectou).";
        changed = true;
      }
    }
    const queued = list.filter((j) => j.status === "queued");
    for (const j of queued) {
      j.status = "running";
      j.runningSince = new Date(now).toISOString();
      j.lastAckAt = j.runningSince;
      changed = true;
    }
    return {
      items: changed ? list : undefined,
      result: queued.map((j) => ({
        id: j.id,
        campaignSlug: j.campaignSlug,
        subject: j.subject,
        desc: j.desc,
        mediaId: j.mediaId,
        announce: j.announce,
        memberAddMode: j.memberAddMode,
      })),
    };
  });
}

/**
 * A engine reporta a criação. Em `created`: registra o grupo no pool (upsert, sem apagar os
 * outros) e adiciona o JID ao groupIds da campanha — assim o /r/<campanha> já roteia p/ ele.
 */
export async function ackGrow(input: {
  id: string;
  status: "running" | "created" | "failed";
  whatsappGroupId?: string;
  members?: number;
  inviteLink?: string;
  error?: string | null;
}): Promise<GrowJob | null> {
  const job = await coll.update(input.id, {
    status: input.status,
    whatsappGroupId: input.whatsappGroupId,
    inviteLink: input.inviteLink,
    error: input.error ?? undefined,
    lastAckAt: new Date().toISOString(),
  });
  if (job && input.status === "created" && input.whatsappGroupId && input.inviteLink) {
    await upsertGroup({
      whatsappGroupId: input.whatsappGroupId,
      name: job.subject,
      members: input.members ?? 0,
      inviteUrl: input.inviteLink,
    });
    const c = (await campanhasColl.list()).find((x) => x.id === job.campanhaId);
    if (c && !c.groupIds.includes(input.whatsappGroupId)) {
      await campanhasColl.update(c.id, { groupIds: [...c.groupIds, input.whatsappGroupId] });
    }
  }
  return job;
}
