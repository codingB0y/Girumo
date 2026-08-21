/**
 * Loop de AUTO-GROW: cria o próximo grupo quando o pool da campanha lota.
 *
 * Porte de `runGrow`/`pollGrow` (`hubflow-engine/index.js:496-594`) para o
 * worker. O original só era agendado dentro do handler `connection === "open"`
 * do socket Baileys; desde o cutover para a Evolution esse socket não existe
 * mais, então a fila enchia e ninguém consumia. O gate que decide QUANDO criar
 * continua onde sempre esteve (o app, via `/api/groups/grow/pending`) — aqui é
 * só a EXECUÇÃO.
 *
 * O grupo nasce vazio e é populado por LINK de convite, nunca por `add`: `add`
 * dispara `account_reachout_restricted`. É a mesma regra do original.
 *
 * ── Anti-ban ──────────────────────────────────────────────────────────────
 * O `GroupOperationGuard` da engine (2 creates/10min) era um bucket em memória
 * do processo, e some no porte. Aqui o teto é a CADÊNCIA: no máximo uma criação
 * por tenant por ciclo, com o ciclo rodando a cada `GROW_INTERVAL_MS` (5 min) —
 * ou seja ~2 por 10 min, o mesmo teto, sem estado e sem tabela nova. O limite do
 * WhatsApp é por número, e cada tenant tem a sua instância, então contar por
 * tenant é o recorte certo: dois lojistas criando ao mesmo tempo são dois
 * números diferentes.
 *
 * Os jobs que sobram do lote não ficam pendurados em `running`: levam ack
 * `failed` com o motivo do ritmo, exatamente como o original fazia ao bater no
 * guard. Não é erro permanente — o `evaluateAutoGrow` re-enfileira no próximo
 * ciclo se a condição ainda valer.
 */

import { log } from "./log.js";

/** Só os campos que o executor precisa. Espelha `GrowClaim` do app. */
export type GrowJobClaim = {
  id: string;
  campaignSlug: string;
  subject: string;
  desc?: string;
  mediaId?: string;
  announce: boolean;
  memberAddMode: "admin_add" | "all_member_add";
};

export type GrowAck = {
  status: "running" | "created" | "failed";
  whatsappGroupId?: string;
  members?: number;
  inviteLink?: string;
  error?: string;
};

/** O que o executor precisa saber da instância que vai criar o grupo. */
export type GrowInstance = {
  /** Nome na Evolution (`provider_instance_id`). */
  name: string;
  /**
   * Número da própria instância. Vai como único `participants` do create — a
   * Evolution exige ao menos um, e o dono já é membro por definição (ver
   * evolution-groups.ts). Instância sem número não consegue criar grupo.
   */
  ownerPhone: string;
};

export type GrowDeps = {
  /** Tenants com auto-grow ligado (ver grow-tenants.ts). */
  listTenants(): Promise<string[]>;
  /** POST /api/groups/grow/pending — avalia o gate e reivindica os jobs. */
  claimJobs(tenantId: string): Promise<GrowJobClaim[]>;
  /** POST /api/groups/grow/ack — reporta o resultado. */
  ack(tenantId: string, jobId: string, ack: GrowAck): Promise<void>;
  /** Instância da Evolution, ou null se o tenant não tem uma utilizável. */
  instanceFor(tenantId: string): Promise<GrowInstance | null>;
  /** Cria o grupo (só com o dono) e devolve o JID. */
  createGroup(instanceName: string, subject: string, ownerPhone: string): Promise<string>;
  setDescription(instanceName: string, groupJid: string, description: string): Promise<void>;
  setAnnounceOnly(instanceName: string, groupJid: string): Promise<void>;
  setPicture(instanceName: string, groupJid: string, imageUrl: string): Promise<void>;
  /**
   * Convite do grupo já em forma canônica (`https://chat.whatsapp.com/<código>`),
   * ou null se a Evolution não devolveu um convite válido. A normalização mora no
   * cliente porque a resposta é dado de terceiro — a engine antiga concatenava o
   * que viesse (ver invite-url.ts).
   */
  inviteUrl(instanceName: string, groupJid: string): Promise<string | null>;
  /** URL assinada da mídia do template, ou null (mídia apagada / id inválido). */
  signedMediaUrl(mediaId: string, tenantId: string): Promise<string | null>;
};

export type GrowTickSummary = {
  tenants: number;
  claimed: number;
  created: number;
  failed: number;
  /** Jobs adiados pelo teto de ritmo (voltam para a fila). */
  deferred: number;
};

/** Teto anti-ban: uma criação por tenant por ciclo. Ver o cabeçalho. */
const MAX_CREATES_PER_TENANT_PER_TICK = 1;

/**
 * Executa best-effort: falha aqui NÃO invalida o grupo. O que importa para o
 * pool é o link de convite; descrição, foto e settings são cosméticos, e um erro
 * neles não justifica descartar um grupo já criado — refazer gastaria outra
 * criação da janela anti-ban.
 */
async function step(label: string, jobId: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    log.warn("auto-grow: passo opcional falhou (ignorado)", {
      job_id: jobId,
      step: label,
      error: err instanceof Error ? err.message : "erro desconhecido",
    });
  }
}

/**
 * Cria e configura UM grupo, reportando cada transição ao app.
 *
 * Devolve `true` se o grupo entrou no pool com link. Não lança por falha de
 * criação: toda falha vira ack `failed`, porque um job preso em `running` só sai
 * de lá pelo `failStaleRunning` (15 min depois) e, nesse meio tempo, o gate do
 * app enxerga "já tem job em voo" e não enfileira de novo.
 */
export async function runGrow(
  tenantId: string,
  instance: GrowInstance,
  job: GrowJobClaim,
  deps: GrowDeps,
): Promise<boolean> {
  const instanceName = instance.name;
  // Renova `last_ack_at` antes da parte lenta: criação + config pode passar de um
  // ciclo, e sem isso o job seria dado como preso enquanto ainda roda.
  await deps.ack(tenantId, job.id, { status: "running" });

  let groupJid: string;
  try {
    groupJid = await deps.createGroup(instanceName, job.subject, instance.ownerPhone);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    log.warn("auto-grow: falha ao criar grupo", { job_id: job.id, subject: job.subject, error: message });
    await deps.ack(tenantId, job.id, { status: "failed", error: `createGroup: ${message}` });
    return false;
  }

  log.info("auto-grow: grupo criado, configurando", { job_id: job.id, group_jid: groupJid });

  const description = job.desc;
  if (description) {
    await step("descrição", job.id, () => deps.setDescription(instanceName, groupJid, description));
  }
  if (job.announce !== false) {
    await step("só admin envia", job.id, () => deps.setAnnounceOnly(instanceName, groupJid));
  }
  if (job.mediaId) {
    const url = await deps.signedMediaUrl(job.mediaId, tenantId).catch(() => null);
    if (url) await step("foto", job.id, () => deps.setPicture(instanceName, groupJid, url));
  }

  // O link é o único passo que NÃO é best-effort: sem ele o grupo não serve ao
  // pool, porque é exatamente o que o /r/<campanha> entrega a quem clica.
  let inviteLink: string | null = null;
  try {
    inviteLink = await deps.inviteUrl(instanceName, groupJid);
  } catch (err) {
    log.warn("auto-grow: não obtive o link de convite", {
      job_id: job.id,
      error: err instanceof Error ? err.message : "erro desconhecido",
    });
  }

  if (!inviteLink) {
    await deps.ack(tenantId, job.id, {
      status: "failed",
      whatsappGroupId: groupJid,
      error: "sem inviteLink (a Evolution não devolveu convite válido)",
    });
    return false;
  }

  await deps.ack(tenantId, job.id, {
    status: "created",
    whatsappGroupId: groupJid,
    members: 1,
    inviteLink,
  });
  log.info("auto-grow concluído", { job_id: job.id, campaign: job.campaignSlug, group_jid: groupJid });
  return true;
}

/**
 * Um ciclo de auto-grow sobre todos os tenants.
 *
 * Falha de um tenant não derruba os outros: cada um é isolado, porque a causa
 * mais provável (app fora, instância desconectada) é local àquele tenant.
 */
export async function runGrowTick(deps: GrowDeps): Promise<GrowTickSummary> {
  const summary: GrowTickSummary = { tenants: 0, claimed: 0, created: 0, failed: 0, deferred: 0 };

  const tenants = await deps.listTenants();
  summary.tenants = tenants.length;

  for (const tenantId of tenants) {
    let jobs: GrowJobClaim[];
    try {
      jobs = await deps.claimJobs(tenantId);
    } catch (err) {
      log.error("auto-grow: claim falhou", {
        tenant_id: tenantId,
        error: err instanceof Error ? err.message : "erro desconhecido",
      });
      continue;
    }
    if (jobs.length === 0) continue;
    summary.claimed += jobs.length;

    // O claim do app já marcou TODOS como `running`. Se a instância sumiu entre
    // o claim e agora, devolve todos à fila em vez de deixá-los presos 15 min.
    const instance = await deps.instanceFor(tenantId).catch(() => null);
    if (!instance) {
      log.warn("auto-grow: tenant sem instância utilizável", { tenant_id: tenantId, jobs: jobs.length });
      for (const job of jobs) {
        summary.deferred += 1;
        await deps
          .ack(tenantId, job.id, { status: "failed", error: "sem instância utilizável para criar o grupo" })
          .catch(() => undefined);
      }
      continue;
    }

    const toRun = jobs.slice(0, MAX_CREATES_PER_TENANT_PER_TICK);
    const deferred = jobs.slice(MAX_CREATES_PER_TENANT_PER_TICK);

    for (const job of toRun) {
      try {
        const ok = await runGrow(tenantId, instance, job, deps);
        if (ok) summary.created += 1;
        else summary.failed += 1;
      } catch (err) {
        // `runGrow` só lança se o próprio ack falhar (app fora). Deixa o job em
        // `running` e o `failStaleRunning` recupera.
        summary.failed += 1;
        log.error("auto-grow: execução falhou", {
          job_id: job.id,
          error: err instanceof Error ? err.message : "erro desconhecido",
        });
      }
    }

    for (const job of deferred) {
      summary.deferred += 1;
      await deps
        .ack(tenantId, job.id, {
          status: "failed",
          error: "ritmo anti-ban: 1 criação por ciclo (será reenfileirado)",
        })
        .catch(() => undefined);
    }
  }

  return summary;
}

export function growDidWork(summary: GrowTickSummary): boolean {
  return summary.claimed > 0;
}
