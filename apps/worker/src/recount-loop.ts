/**
 * Loop de RECONTAGEM: uma vez por dia, reconta os grupos de cada loja com número
 * conectado (spec "postar por grupo" §6.3).
 *
 * Por que existe: a contagem de membros só anda pelo webhook
 * `group-participants.update` e pelo botão Sincronizar. Evento perdido = contagem
 * errada para sempre = a marca automática de lotado (trigger do PR 1, que olha
 * `members`) nunca vem, e o link continua mandando gente para um grupo cheio.
 *
 * A decisão e a escrita moram no app (`POST /api/groups/recount`, que reusa o
 * núcleo do Sincronizar com `somenteContagem`); aqui é só a cadência — o mesmo
 * arranjo do auto-grow.
 *
 * ── Memória entre boots ────────────────────────────────────────────────────
 * O primeiro tick roda na subida do container, e o Coolify sobe um container
 * novo a cada push na `main`. Medido em prod em 30/10 e 31/10/2026: 10 e 9
 * subidas no dia, cada uma virando um `fetchAllGroups` (55 grupos com
 * participantes + 55 fotos, 10–29 s) no único número conectado da plataforma —
 * horas antes de uma restrição do WhatsApp (03/11). Leitura em massa de grupo é
 * exatamente o padrão que o WhatsApp trata como coleta de dados.
 *
 * Por isso o estado da recontagem NÃO vive no processo: antes de recontar, o
 * loop pergunta ao banco quais lojas já têm contagem fresca (`groups.recounted`
 * ou `groups.synced` em `logs` nas últimas RECOUNT_MIN_GAP_HOURS) e pula essas.
 * Um redeploy deixa de ser um gatilho de leitura; o tick diário segue igual.
 *
 * Nasce em DRY-RUN (`WORKER_RECOUNT_ENABLED != true`), como os outros loops: lista
 * as lojas e loga quem recontaria, sem chamar o app.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { AppRequestError, type AppClient } from "./app-client.js";
import { distinctTenantIds } from "./grow-tenants.js";
import { log } from "./log.js";

/**
 * Teto do POST por loja. A rota roda com `maxDuration = 60` (o `fetchAllGroups`
 * da Evolution chega a 50 s): com os 20 s padrão do client, o worker desistiria no
 * meio de toda loja grande e contaria falha de um trabalho que o app terminou.
 */
export const RECOUNT_TIMEOUT_MS = 70_000;

/**
 * Loja com contagem mais nova que isto não é recontada. Fica ABAIXO das 24 h do
 * intervalo padrão de propósito: o tick diário chega alguns segundos depois do
 * anterior, e um gap de 24 h cravadas pularia a recontagem dia sim, dia não.
 */
export const RECOUNT_MIN_GAP_HOURS = 20;

/**
 * Eventos de `logs` que deixam a contagem fresca. O Sincronizar completo do
 * painel (`groups.synced`) lê os mesmos grupos que a recontagem, então também
 * conta — senão o lojista que clicou Sincronizar às 23h ganharia outra varredura
 * à meia-noite.
 */
export const RECOUNT_FRESH_EVENTS = ["groups.recounted", "groups.synced"] as const;

export type RecountDeps = {
  /** Lojas com ao menos um número dos grupos `connected`. */
  listTenants(): Promise<string[]>;
  /** Lojas com contagem fresca desde `since` (RECOUNT_FRESH_EVENTS em `logs`). */
  countedSince(since: Date): Promise<string[]>;
  /** `POST /api/groups/recount` — quantos grupos tiveram a contagem regravada. */
  recount(tenantId: string): Promise<number>;
};

export type RecountTickSummary = {
  tenants: number;
  /** Lojas puladas por terem contagem com menos de RECOUNT_MIN_GAP_HOURS. */
  recentes: number;
  atualizados: number;
  /** 409: outro sync do número rodando (trava do #397) ou o número caiu no meio. */
  pulados: number;
  falhas: number;
};

/**
 * Lojas a recontar: as listadas, na mesma ordem, menos as com contagem fresca.
 * Pura, para o teste provar o filtro sem banco.
 */
export function tenantsDue(tenants: readonly string[], fresh: Iterable<string>): string[] {
  const frescas = new Set(fresh);
  return tenants.filter((tenantId) => !frescas.has(tenantId));
}

/**
 * Uma volta sobre as lojas, UMA POR VEZ: a Evolution é uma só para todos os
 * números, e cada recontagem é um `fetchAllGroups` de até 50 s. Em paralelo, a
 * volta empilharia chamadas pesadas e derrubaria o Sincronizar de quem clicasse
 * no meio.
 *
 * `now` é injetável para o teste fixar o instante do gap.
 */
export async function runRecountTick(
  deps: RecountDeps,
  isStopping: () => boolean = () => false,
  now: () => number = Date.now,
): Promise<RecountTickSummary> {
  const summary: RecountTickSummary = { tenants: 0, recentes: 0, atualizados: 0, pulados: 0, falhas: 0 };
  const tenants = await deps.listTenants();
  summary.tenants = tenants.length;
  if (tenants.length === 0) return summary;

  // Quem já tem contagem fresca não lê o WhatsApp de novo. A consulta vem ANTES
  // do laço de propósito: é ela que faz o boot do container não virar varredura.
  const since = new Date(now() - RECOUNT_MIN_GAP_HOURS * 3_600_000);
  const devidas = tenantsDue(tenants, await deps.countedSince(since));
  summary.recentes = tenants.length - devidas.length;
  if (summary.recentes > 0) {
    log.info("recontagem: lojas com contagem fresca, puladas", {
      recentes: summary.recentes,
      gap_horas: RECOUNT_MIN_GAP_HOURS,
    });
  }

  for (const tenantId of devidas) {
    // Uma volta pode levar minutos; o shutdown não espera por ela inteira.
    if (isStopping()) break;
    try {
      summary.atualizados += await deps.recount(tenantId);
    } catch (err) {
      // Não é falha: amanhã tem outra volta.
      if (err instanceof AppRequestError && err.status === 409) {
        summary.pulados += 1;
        log.info("recontagem: loja pulada (409)", { tenant_id: tenantId });
        continue;
      }
      summary.falhas += 1;
      log.error("recontagem: loja falhou", {
        tenant_id: tenantId,
        error: err instanceof Error ? err.message : "erro desconhecido",
      });
    }
  }

  return summary;
}

export function recountDidWork(summary: RecountTickSummary): boolean {
  return summary.tenants > 0;
}

/**
 * Lojas distintas com ao menos um número dos grupos `connected`. O número do atendimento
 * (`purpose = 'privado'`) não conta: não lê grupo, então loja só com ele não tem o que recontar.
 */
export async function listRecountTenants(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("instances")
    .select("tenant_id")
    .eq("status", "connected")
    .eq("purpose", "grupos");
  if (error) throw new Error(`listRecountTenants: ${error.message}`);
  return distinctTenantIds(data ?? []);
}

/**
 * Lojas com `groups.recounted` ou `groups.synced` em `logs` desde `since`. É o
 * mesmo registro que `sincronizarGrupos` grava ao fim de cada leitura — não há
 * coluna nova nem migração: a memória da recontagem é o próprio log dela.
 */
export async function listCountedSince(supabase: SupabaseClient, since: Date): Promise<string[]> {
  const { data, error } = await supabase
    .from("logs")
    .select("tenant_id")
    .in("event", [...RECOUNT_FRESH_EVENTS])
    .gte("created_at", since.toISOString());
  if (error) throw new Error(`listCountedSince: ${error.message}`);
  return distinctTenantIds(data ?? []);
}

export function makeRecountDeps(supabase: SupabaseClient, app: AppClient): RecountDeps {
  return {
    listTenants: () => listRecountTenants(supabase),
    countedSince: (since) => listCountedSince(supabase, since),
    async recount(tenantId) {
      const resposta = await app.post<{ ok: true; atualizados: number }>(tenantId, "/api/groups/recount");
      return typeof resposta?.atualizados === "number" ? resposta.atualizados : 0;
    },
  };
}

/** DRY-RUN: lista as lojas e loga quem recontaria, sem chamar o app. */
export function withRecountDryRun(deps: RecountDeps): RecountDeps {
  return {
    ...deps,
    async recount(tenantId) {
      log.info("DRY-RUN: recontaria os grupos", { tenant_id: tenantId });
      return 0;
    },
  };
}
