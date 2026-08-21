import "server-only";
import { collection } from "@/lib/json-collection";
import { campanhasColl, type Campanha } from "@/lib/campanhas-store";
import { listGroups, upsertGroup } from "@/lib/groups-store";
import { DEFAULT_GROUP_CAPACITY } from "@/lib/links/resolve-click-target";
import { shouldEnqueueGrow, type PoolGroup } from "@/lib/groups/grow-headroom";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaCampaigns from "@/lib/stores/campaign-groups";
import * as supaGroups from "@/lib/stores/groups";
import * as supaJobs from "@/lib/stores/group-grow-jobs";

// Fila de criação de grupo (auto-grow). Espelha o motor de disparo:
//   queued → enfileirado, aguardando o executor puxar
//   running → executor claimou e está criando no WhatsApp
//   created → grupo criado, registrado no pool e o /r/<campanha> já o roteia
//   failed  → criação falhou (ou job preso recuperado)
//
// Dual-mode: em produção `USE_SUPABASE` está ligado e o estado vive em
// `group_grow_jobs`; o ramo JSON continua para o fallback local. Antes deste PR
// só existia o JSON — ou seja, em produção o auto-grow não tinha onde gravar.
const growColl = (tenantId: string) => collection<GrowJob>(`tenants/${tenantId}/group-grow.json`);

type GrowJobStatus = "queued" | "running" | "created" | "failed";

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

// Job preso em "running" sem ack há mais que isto → "failed" (executor caiu).
const STALE_RUNNING_MS = supaJobs.STALE_RUNNING_MS;

// Só os campos que o executor precisa p/ criar o grupo.
export type GrowClaim = Pick<
  GrowJob,
  "id" | "campaignSlug" | "subject" | "desc" | "mediaId" | "announce" | "memberAddMode"
>;

type GrowTemplate = {
  subjectPattern: string;
  desc?: string;
  mediaId?: string;
  announce: boolean;
  memberAddMode: "admin_add" | "all_member_add";
};

/** `grow_template` é jsonb livre no banco — normaliza antes de confiar. */
function parseGrowTemplate(raw: unknown): GrowTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const subjectPattern = String(t.subjectPattern ?? "").trim();
  if (!subjectPattern) return null;
  return {
    subjectPattern,
    desc: t.desc ? String(t.desc) : undefined,
    mediaId: t.mediaId ? String(t.mediaId) : undefined,
    announce: t.announce !== false,
    memberAddMode: t.memberAddMode === "all_member_add" ? "all_member_add" : "admin_add",
  };
}

/** Resolve o `{n}` do molde no nome final do grupo. */
function resolveSubject(pattern: string, n: number): string {
  return pattern.includes("{n}") ? pattern.replace("{n}", String(n)) : `${pattern} ${n}`;
}

/**
 * Proativo: p/ cada campanha com autoGrow, se o pool não tem mais nenhum grupo
 * roteável com folga e não há job em andamento, enfileira a criação do próximo.
 * Chamado quando o executor puxa a fila — sem timer.
 *
 * A decisão de "merece grupo novo?" mora em `shouldEnqueueGrow` — inclusive o
 * caso do pool sem convite nenhum, que NÃO é lotação.
 */
export async function evaluateAutoGrow(tenantId: string): Promise<void> {
  if (USE_SUPABASE) return evaluateAutoGrowSupabase(tenantId);

  const coll = growColl(tenantId);
  const [campanhas, groups, jobs] = await Promise.all([
    campanhasColl.list().then((items) => items.filter((item) => item.tenantId === tenantId)),
    listGroups(tenantId),
    coll.list(),
  ]);
  const byId = new Map(groups.map((g) => [g.whatsappGroupId, g]));
  for (const c of campanhas) {
    const template = parseGrowTemplate(c.growTemplate);
    if (!c.autoGrow || !template) continue;
    // Não empilha: já existe job em andamento p/ esta campanha?
    if (jobs.some((j) => j.campanhaId === c.id && (j.status === "queued" || j.status === "running"))) continue;
    const pool: PoolGroup[] = c.groupIds
      .map((id) => byId.get(id))
      .filter((g): g is NonNullable<typeof g> => !!g)
      .map((g) => ({ members: g.members, capacity: g.capacity, inviteUrl: g.inviteUrl }));
    if (!shouldEnqueueGrow(pool, c.groupIds.length)) continue;
    await enqueueGrow(tenantId, c, template);
  }
}

async function evaluateAutoGrowSupabase(tenantId: string): Promise<void> {
  const [campanhas, groups, inFlight] = await Promise.all([
    supaCampaigns.listCampaignGroups(tenantId),
    supaGroups.listGroups(tenantId),
    supaJobs.listInFlightCampaignIds(tenantId),
  ]);
  const byId = new Map(groups.map((g) => [g.whatsapp_group_id, g]));
  for (const c of campanhas) {
    const template = parseGrowTemplate(c.grow_template);
    if (!c.auto_grow || !template) continue;
    if (inFlight.has(c.id)) continue;
    const pool: PoolGroup[] = c.group_ids
      .map((id) => byId.get(id))
      .filter((g): g is NonNullable<typeof g> => !!g)
      .map((g) => ({ members: g.members, capacity: g.capacity, inviteUrl: g.invite_url }));
    if (!shouldEnqueueGrow(pool, c.group_ids.length)) continue;

    const seq = await supaJobs.nextSeq(tenantId, c.id, c.group_ids.length);
    await supaJobs.enqueueGrowJob(tenantId, {
      campaign_group_id: c.id,
      campaign_slug: c.slug ?? "",
      seq,
      subject: resolveSubject(template.subjectPattern, seq),
      description: template.desc,
      media_id: template.mediaId,
      announce: template.announce,
      member_add_mode: template.memberAddMode,
    });
  }
}

/** Enfileira 1 job de criação p/ a campanha, numerando o nome pelo growCounter. */
async function enqueueGrow(tenantId: string, c: Campanha, template: GrowTemplate): Promise<void> {
  const coll = growColl(tenantId);
  const n = (c.growCounter ?? c.groupIds.length) + 1;
  await coll.create({
    campanhaId: c.id,
    campaignSlug: c.slug ?? "",
    subject: resolveSubject(template.subjectPattern, n),
    desc: template.desc,
    mediaId: template.mediaId,
    announce: template.announce,
    memberAddMode: template.memberAddMode,
    status: "queued",
    createdAt: new Date().toISOString(),
  } as Omit<GrowJob, "id">);
  await campanhasColl.update(c.id, { growCounter: n });
}

/**
 * O executor reivindica os jobs enfileirados numa transação atômica (sem criação
 * dupla) e, no mesmo passo, recupera jobs "running" presos (executor caiu) → "failed".
 */
export async function claimGrow(tenantId: string): Promise<GrowClaim[]> {
  if (USE_SUPABASE) {
    await supaJobs.failStaleRunning(tenantId);
    const rows = await supaJobs.claimQueued(tenantId);
    return rows.map((r) => ({
      id: r.id,
      campaignSlug: r.campaign_slug,
      subject: r.subject,
      desc: r.description ?? undefined,
      mediaId: r.media_id ?? undefined,
      announce: r.announce,
      memberAddMode: r.member_add_mode,
    }));
  }

  const coll = growColl(tenantId);
  return coll.transact<GrowClaim[]>((list) => {
    const now = Date.now();
    let changed = false;
    for (const j of list) {
      if (j.status !== "running") continue;
      const ref = j.lastAckAt ?? j.runningSince;
      if (ref && now - new Date(ref).getTime() > STALE_RUNNING_MS) {
        j.status = "failed";
        j.error = "Criação interrompida (executor desconectou).";
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
 * O executor reporta a criação. Em `created`: registra o grupo no pool (upsert, sem
 * apagar os outros) e adiciona o JID ao groupIds da campanha — assim o /r/<campanha>
 * já roteia p/ ele.
 */
export async function ackGrow(tenantId: string, input: {
  id: string;
  status: "running" | "created" | "failed";
  whatsappGroupId?: string;
  members?: number;
  inviteLink?: string;
  error?: string | null;
}): Promise<GrowJob | null> {
  if (USE_SUPABASE) return ackGrowSupabase(tenantId, input);

  const job = await growColl(tenantId).update(input.id, {
    status: input.status,
    whatsappGroupId: input.whatsappGroupId,
    inviteLink: input.inviteLink,
    error: input.error ?? undefined,
    lastAckAt: new Date().toISOString(),
  });
  if (job && input.status === "created" && input.whatsappGroupId && input.inviteLink) {
    await upsertGroup(tenantId, {
      whatsappGroupId: input.whatsappGroupId,
      name: job.subject,
      members: input.members ?? 0,
      inviteUrl: input.inviteLink,
    });
    const c = (await campanhasColl.list()).find((x) => x.id === job.campanhaId && x.tenantId === tenantId);
    if (c && !c.groupIds.includes(input.whatsappGroupId)) {
      await campanhasColl.update(c.id, { groupIds: [...c.groupIds, input.whatsappGroupId] });
    }
  }
  return job;
}

async function ackGrowSupabase(tenantId: string, input: {
  id: string;
  status: "running" | "created" | "failed";
  whatsappGroupId?: string;
  members?: number;
  inviteLink?: string;
  error?: string | null;
}): Promise<GrowJob | null> {
  const row = await supaJobs.ackGrowJob(tenantId, input.id, {
    status: input.status,
    whatsapp_group_id: input.whatsappGroupId,
    invite_url: input.inviteLink,
    error: input.error ?? null,
  });
  if (!row) return null;

  if (input.status === "created" && input.whatsappGroupId && input.inviteLink) {
    await registerGrownGroup(tenantId, {
      whatsappGroupId: input.whatsappGroupId,
      name: row.subject,
      members: input.members ?? 0,
      inviteUrl: input.inviteLink,
    });
    const campanha = await supaCampaigns.getCampaignGroupById(tenantId, row.campaign_group_id);
    if (campanha && !campanha.group_ids.includes(input.whatsappGroupId)) {
      await supaCampaigns.updateCampaignGroup(tenantId, campanha.id, {
        group_ids: [...campanha.group_ids, input.whatsappGroupId],
      });
    }
  }
  return toGrowJob(row);
}

/**
 * Registra o grupo recém-criado no pool SEM apagar os demais e sem resetar o que
 * o lojista configurou — se o ack for reentregue, só atualiza nome/membros/convite.
 */
async function registerGrownGroup(tenantId: string, g: {
  whatsappGroupId: string;
  name: string;
  members: number;
  inviteUrl: string;
}): Promise<void> {
  const existing = (await supaGroups.listGroups(tenantId)).find(
    (row) => row.whatsapp_group_id === g.whatsappGroupId,
  );
  if (existing) {
    await supaGroups.updateGroup(tenantId, existing.id, {
      name: g.name,
      members: g.members,
      invite_url: g.inviteUrl,
    });
    return;
  }
  await supaGroups.upsertGroupsBatch(tenantId, [{
    whatsapp_group_id: g.whatsappGroupId,
    name: g.name,
    members: g.members,
    capacity: DEFAULT_GROUP_CAPACITY,
    selected: false,
    engagement: "medio",
    invite_url: g.inviteUrl,
    // Quem cria um grupo no WhatsApp é admin dele — não é suposição, é a regra da
    // plataforma. Sem esta flag o grupo entra no pool "não-admin" e a captura de
    // lead o descarta (`lead-capture.ts`), então todo mundo que entrasse pelo
    // link recém-criado seria perdido até o próximo sync recalcular `is_admin`.
    // A janela é curta, mas o link vai ao ar no mesmo instante: é justamente
    // quando mais gente entra.
    is_admin: true,
  }]);
}

function toGrowJob(r: supaJobs.GrowJobRow): GrowJob {
  return {
    id: r.id,
    campanhaId: r.campaign_group_id,
    campaignSlug: r.campaign_slug,
    subject: r.subject,
    desc: r.description ?? undefined,
    mediaId: r.media_id ?? undefined,
    announce: r.announce,
    memberAddMode: r.member_add_mode,
    status: r.status,
    whatsappGroupId: r.whatsapp_group_id ?? undefined,
    inviteLink: r.invite_url ?? undefined,
    error: r.error ?? undefined,
    createdAt: r.created_at,
    runningSince: r.running_since ?? undefined,
    lastAckAt: r.last_ack_at ?? undefined,
  };
}
