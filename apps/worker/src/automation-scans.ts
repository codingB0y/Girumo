/**
 * Varreduras periódicas do executor de automações — os três gatilhos que não
 * nascem de um evento (camada 2, parte 2, do plano em
 * docs/superpowers/plans/2026-07-29-automations-executor.md). `lead_entered`
 * já dispara direto de `lead-capture.ts`; estes só têm como saber "aconteceu"
 * varrendo o banco. Rodam numa cadência bem mais lenta que o tick de fila
 * (ver SCAN_INTERVAL_MS em index.ts) — não faz sentido varrer `groups` inteiro
 * a cada poll de 3s.
 *
 * Fan-out: `automations` não tem campo de "qual grupo" (só existe implícito
 * pra `lead_entered`, cujo alvo é o grupo do próprio evento). Os três gatilhos
 * daqui disparam UM RUN POR GRUPO do tenant que casa a condição — nunca um
 * run único "pro tenant". `weekly_recurring` roda pra TODOS os grupos
 * sincronizados do tenant onde somos admin: não existe hoje um jeito de
 * escolher um subconjunto (`groups.selected` não é usado em lugar nenhum da
 * UI atual — não é um sinal confiável de "grupo ativo", por isso não foi
 * reaproveitado aqui).
 *
 * SÓ GRUPOS ONDE SOMOS ADMIN. Mesma política que `lead-capture.ts` já aplica
 * na captura ("melhor não capturar do que capturar grupo errado"). Aqui vale
 * ainda mais forte, porque esta é a ponta que ENVIA: mandar propaganda para
 * a comunidade de um terceiro é pior do que capturar lead dela. Sem este
 * filtro, uma varredura em produção (29/07) gerou 193 comandos, 104 deles
 * para grupos onde o lojista é só membro — ~31 mil pessoas fora da base dele.
 *
 * Cadência de reenvio — decisão deliberada, menos risco de spam > repetição
 * automática:
 *   - `group_full`/`group_stalled`: dedupe_key SEM componente de tempo
 *     (`<tipo>:<group_id>:<automation_id>`). Cada (automação, grupo) dispara
 *     uma vez só, pra sempre. Se o grupo esvaziar e lotar de novo, ou
 *     reativar e parar de novo, não dispara uma segunda vez.
 *   - `weekly_recurring`: dedupe_key COM a data (`weekly:<group>:<automation>:<YYYY-MM-DD>`),
 *     porque este é o único dos três que deve mesmo repetir. O gate real de
 *     "uma vez por semana" é `automations.last_run_at` (mesma coluna que
 *     `finish_automation_run` já atualiza); o carimbo de data é só a rede de
 *     segurança contra a varredura rodar de novo no mesmo dia antes do
 *     `last_run_at` reflect ir a primeira run concluída.
 *
 * `group_stalled`: sem sinal de atividade de CONVERSA no Postgres — isso vive
 * só em activity.json, no app web, fora do alcance do worker (processo
 * separado, só fala com o Postgres via service_role). Proxy: "nenhum lead
 * novo neste grupo há STALLED_DAYS dias" — metade do sinal que
 * business-health.ts já usa em `gruposParados` (a outra metade, contagem de
 * mensagens, não está disponível aqui).
 *
 * O proxy DEGENERA quando o tenant não tem lead nenhum: "nenhum lead novo há
 * 7 dias" é verdade para todo grupo, e o filtro deixa de filtrar. Foi o que
 * aconteceu em produção em 29/07 — tenant com 0 leads, varredura casou os
 * 193 grupos de uma vez. Enquanto não existe UM lead sequer no tenant não há
 * como distinguir "parado" de "nunca começou", então `group_stalled` não
 * dispara. Ver `tenantsWithAnyLead`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const STALLED_DAYS = 7;
const RECURRING_DAYS = 7;

export type AutomationRow = {
  id: string;
  tenant_id: string;
};

export type GroupScanRow = {
  id: string;
  whatsappGroupId: string;
  members: number;
  capacity: number;
  /** Houve lead novo vindo deste grupo nos últimos STALLED_DAYS dias. */
  hasRecentLead: boolean;
  /** Somos admin do grupo. Nenhuma varredura dispara para grupo de terceiro. */
  isAdmin: boolean;
};

export type ScanCandidate = {
  tenantId: string;
  automationId: string;
  targetGroupJid: string;
  dedupeKey: string;
  triggerContext: Record<string, unknown>;
};

export interface ScanDeps {
  listGroupFullAutomations(): Promise<AutomationRow[]>;
  listGroupStalledAutomations(): Promise<AutomationRow[]>;
  /** Já filtra por `last_run_at` (nulo ou > RECURRING_DAYS dias) — feito no banco. */
  listWeeklyRecurringAutomations(): Promise<AutomationRow[]>;
  /** Grupos dos tenants dados, indexados por tenant_id. */
  listGroupsByTenant(tenantIds: string[]): Promise<Map<string, GroupScanRow[]>>;
  /** Tenants que têm ao menos UM lead — gate do `group_stalled`, ver topo do arquivo. */
  listTenantsWithAnyLead(tenantIds: string[]): Promise<Set<string>>;
  /** Cria o run. Devolve `false` (não lança) quando o dedupe_key já existia. */
  createRun(candidate: ScanCandidate): Promise<boolean>;
}

export function groupFullCandidates(
  automations: AutomationRow[],
  groupsByTenant: Map<string, GroupScanRow[]>,
): ScanCandidate[] {
  const out: ScanCandidate[] = [];
  for (const automation of automations) {
    for (const group of groupsByTenant.get(automation.tenant_id) ?? []) {
      if (!group.isAdmin) continue;
      if (group.members < group.capacity) continue;
      out.push({
        tenantId: automation.tenant_id,
        automationId: automation.id,
        targetGroupJid: group.whatsappGroupId,
        dedupeKey: `group_full:${group.id}:${automation.id}`,
        triggerContext: { group_id: group.id, members: group.members, capacity: group.capacity },
      });
    }
  }
  return out;
}

export function groupStalledCandidates(
  automations: AutomationRow[],
  groupsByTenant: Map<string, GroupScanRow[]>,
  tenantsWithAnyLead: Set<string>,
): ScanCandidate[] {
  const out: ScanCandidate[] = [];
  for (const automation of automations) {
    // Tenant sem lead nenhum: o proxy de "parado" casa todo grupo. Ver topo.
    if (!tenantsWithAnyLead.has(automation.tenant_id)) continue;
    for (const group of groupsByTenant.get(automation.tenant_id) ?? []) {
      if (!group.isAdmin) continue;
      if (group.hasRecentLead) continue;
      out.push({
        tenantId: automation.tenant_id,
        automationId: automation.id,
        targetGroupJid: group.whatsappGroupId,
        dedupeKey: `group_stalled:${group.id}:${automation.id}`,
        triggerContext: { group_id: group.id },
      });
    }
  }
  return out;
}

export function weeklyRecurringCandidates(
  automations: AutomationRow[],
  groupsByTenant: Map<string, GroupScanRow[]>,
  dateStamp: string,
): ScanCandidate[] {
  const out: ScanCandidate[] = [];
  for (const automation of automations) {
    for (const group of groupsByTenant.get(automation.tenant_id) ?? []) {
      if (!group.isAdmin) continue;
      out.push({
        tenantId: automation.tenant_id,
        automationId: automation.id,
        targetGroupJid: group.whatsappGroupId,
        dedupeKey: `weekly:${group.id}:${automation.id}:${dateStamp}`,
        triggerContext: { group_id: group.id },
      });
    }
  }
  return out;
}

/** Deps reais (Supabase). Testes usam deps fake com os candidatos já resolvidos. */
export function makeScanDeps(supabase: SupabaseClient): ScanDeps {
  async function listAutomationsByTrigger(trigger: string): Promise<AutomationRow[]> {
    const { data, error } = await supabase
      .from("automations")
      .select("id, tenant_id")
      .eq("trigger", trigger)
      .eq("enabled", true);
    if (error) throw new Error(`listAutomationsByTrigger(${trigger}): ${error.message}`);
    return (data ?? []) as AutomationRow[];
  }

  return {
    listGroupFullAutomations: () => listAutomationsByTrigger("group_full"),
    listGroupStalledAutomations: () => listAutomationsByTrigger("group_stalled"),

    async listWeeklyRecurringAutomations() {
      const cutoff = new Date(Date.now() - RECURRING_DAYS * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("automations")
        .select("id, tenant_id")
        .eq("trigger", "weekly_recurring")
        .eq("enabled", true)
        .or(`last_run_at.is.null,last_run_at.lt.${cutoff}`);
      if (error) throw new Error(`listWeeklyRecurringAutomations: ${error.message}`);
      return (data ?? []) as AutomationRow[];
    },

    async listGroupsByTenant(tenantIds) {
      if (tenantIds.length === 0) return new Map();

      const cutoffIso = new Date(Date.now() - STALLED_DAYS * 86_400_000).toISOString();
      const [{ data: groups, error: groupsError }, { data: recentLeads, error: leadsError }] = await Promise.all([
        supabase
          .from("groups")
          .select("id, tenant_id, whatsapp_group_id, members, capacity, is_admin")
          .in("tenant_id", tenantIds),
        supabase
          .from("leads")
          .select("tenant_id, source_group_id")
          .in("tenant_id", tenantIds)
          .gte("entered_at", cutoffIso),
      ]);
      if (groupsError) throw new Error(`listGroupsByTenant: ${groupsError.message}`);
      if (leadsError) throw new Error(`listGroupsByTenant: ${leadsError.message}`);

      const activeGroupKeys = new Set(
        ((recentLeads ?? []) as { tenant_id: string; source_group_id: string | null }[])
          .filter((lead) => lead.source_group_id)
          .map((lead) => `${lead.tenant_id}:${lead.source_group_id}`),
      );

      const byTenant = new Map<string, GroupScanRow[]>();
      for (const g of (groups ?? []) as {
        id: string;
        tenant_id: string;
        whatsapp_group_id: string;
        members: number;
        capacity: number;
        is_admin: boolean | null;
      }[]) {
        const row: GroupScanRow = {
          id: g.id,
          whatsappGroupId: g.whatsapp_group_id,
          members: g.members,
          capacity: g.capacity,
          hasRecentLead: activeGroupKeys.has(`${g.tenant_id}:${g.whatsapp_group_id}`),
          // `is_admin` nulo (grupo sincronizado antes da coluna existir) conta
          // como NÃO admin: na dúvida, não envia.
          isAdmin: g.is_admin === true,
        };
        const list = byTenant.get(g.tenant_id);
        if (list) list.push(row);
        else byTenant.set(g.tenant_id, [row]);
      }
      return byTenant;
    },

    async listTenantsWithAnyLead(tenantIds) {
      if (tenantIds.length === 0) return new Set();
      const { data, error } = await supabase.from("leads").select("tenant_id").in("tenant_id", tenantIds);
      if (error) throw new Error(`listTenantsWithAnyLead: ${error.message}`);
      return new Set(((data ?? []) as { tenant_id: string }[]).map((row) => row.tenant_id));
    },

    async createRun(candidate) {
      const { error } = await supabase.from("automation_runs").insert({
        tenant_id: candidate.tenantId,
        automation_id: candidate.automationId,
        trigger_context: candidate.triggerContext,
        target_group_jid: candidate.targetGroupJid,
        dedupe_key: candidate.dedupeKey,
      });
      if (!error) return true;
      if (error.code === "23505") return false; // já existia — dedupe funcionando, não é erro
      throw new Error(`createRun: ${error.message}`);
    },
  };
}

export type ScansSummary = {
  groupFullCreated: number;
  groupStalledCreated: number;
  weeklyRecurringCreated: number;
};

export async function runAutomationScansTick(deps: ScanDeps, now: Date = new Date()): Promise<ScansSummary> {
  const [fullAutomations, stalledAutomations, recurringAutomations] = await Promise.all([
    deps.listGroupFullAutomations(),
    deps.listGroupStalledAutomations(),
    deps.listWeeklyRecurringAutomations(),
  ]);

  const tenantIds = [
    ...new Set(
      [...fullAutomations, ...stalledAutomations, ...recurringAutomations].map((automation) => automation.tenant_id),
    ),
  ];
  const [groupsByTenant, tenantsWithAnyLead] = await Promise.all([
    deps.listGroupsByTenant(tenantIds),
    deps.listTenantsWithAnyLead(tenantIds),
  ]);
  const dateStamp = now.toISOString().slice(0, 10);

  const summary: ScansSummary = { groupFullCreated: 0, groupStalledCreated: 0, weeklyRecurringCreated: 0 };

  for (const candidate of groupFullCandidates(fullAutomations, groupsByTenant)) {
    if (await deps.createRun(candidate)) summary.groupFullCreated += 1;
  }
  for (const candidate of groupStalledCandidates(stalledAutomations, groupsByTenant, tenantsWithAnyLead)) {
    if (await deps.createRun(candidate)) summary.groupStalledCreated += 1;
  }
  for (const candidate of weeklyRecurringCandidates(recurringAutomations, groupsByTenant, dateStamp)) {
    if (await deps.createRun(candidate)) summary.weeklyRecurringCreated += 1;
  }

  return summary;
}
