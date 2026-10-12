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

export type RecountDeps = {
  /** Lojas com ao menos um número `connected`. */
  listTenants(): Promise<string[]>;
  /** `POST /api/groups/recount` — quantos grupos tiveram a contagem regravada. */
  recount(tenantId: string): Promise<number>;
};

export type RecountTickSummary = {
  tenants: number;
  atualizados: number;
  /** 409: outro sync do número rodando (trava do #397) ou o número caiu no meio. */
  pulados: number;
  falhas: number;
};

/**
 * Uma volta sobre as lojas, UMA POR VEZ: a Evolution é uma só para todos os
 * números, e cada recontagem é um `fetchAllGroups` de até 50 s. Em paralelo, a
 * volta empilharia chamadas pesadas e derrubaria o Sincronizar de quem clicasse
 * no meio.
 */
export async function runRecountTick(
  deps: RecountDeps,
  isStopping: () => boolean = () => false,
): Promise<RecountTickSummary> {
  const summary: RecountTickSummary = { tenants: 0, atualizados: 0, pulados: 0, falhas: 0 };
  const tenants = await deps.listTenants();
  summary.tenants = tenants.length;

  for (const tenantId of tenants) {
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

/** Lojas distintas com ao menos uma instância `connected`. */
export async function listRecountTenants(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("instances").select("tenant_id").eq("status", "connected");
  if (error) throw new Error(`listRecountTenants: ${error.message}`);
  return distinctTenantIds(data ?? []);
}

export function makeRecountDeps(supabase: SupabaseClient, app: AppClient): RecountDeps {
  return {
    listTenants: () => listRecountTenants(supabase),
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
