import assert from "node:assert/strict";
import { after, test } from "node:test";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Contra o Supabase de DEV. A regra "perdeu a hora, não dispara" vive em duas RPCs
 * (`promote_due_schedules` e `claim_send_commands`) — teste unitário não as alcança.
 *
 * Incidente de 30/09/2026: a VPS ficou fora do ar dois dias e, ao voltar, tudo que
 * estava agendado saiu de uma vez, fora de hora.
 */

const TENANT = process.env.E2E_TENANT_ID ?? "";
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = crypto.randomUUID().slice(0, 8);
const HORA_MS = 3_600_000;
const MIN_MS = 60_000;
// Bem além da tolerância de 15 min de app.missed_send_tolerance().
const DUAS_HORAS_ATRAS = () => new Date(Date.now() - 2 * HORA_MS).toISOString();

const broadcastIds: string[] = [];
const scheduleIds: string[] = [];
// Loja descartável dos casos de plano: a de QA tem plano ativo e os e2e contam com isso.
let lojaDoPlano = "";

after(async () => {
  if (!TENANT || EM_PRODUCAO) return;
  const supabase = getSupabaseAdmin();
  if (broadcastIds.length) {
    await supabase.from("engine_commands").delete().in("origin_id", broadcastIds);
  }
  if (scheduleIds.length) await supabase.from("schedules").delete().in("id", scheduleIds);
  if (broadcastIds.length) await supabase.from("broadcasts").delete().in("id", broadcastIds);
  // A cascata de organizations leva assinatura, agendamentos e disparos dela.
  if (lojaDoPlano) await supabase.from("organizations").delete().eq("id", lojaDoPlano);
});

function pular(): boolean {
  if (EM_PRODUCAO) {
    console.log("SUPABASE_URL é de produção — teste de integração pulado");
    return true;
  }
  if (!TENANT) {
    console.log("E2E_TENANT_ID ausente — teste de integração pulado");
    return true;
  }
  return false;
}

async function criarAgendamento(scheduledAt: string, recurrence: "none" | "daily", tenant = TENANT) {
  const supabase = getSupabaseAdmin();
  const { data: b, error: eb } = await supabase
    .from("broadcasts")
    .insert({ tenant_id: tenant, name: `perdeu-hora-${RUN}`, message: "teste", status: "draft" })
    .select("id")
    .single();
  if (eb) throw new Error(eb.message);
  broadcastIds.push(b!.id);

  const { data: s, error: es } = await supabase
    .from("schedules")
    .insert({
      tenant_id: tenant,
      name: `perdeu-hora-${RUN}`,
      broadcast_id: b!.id,
      scheduled_at: scheduledAt,
      recurrence,
      status: "pending",
    })
    .select("id")
    .single();
  if (es) throw new Error(es.message);
  scheduleIds.push(s!.id);
  return { broadcastId: b!.id as string, scheduleId: s!.id as string };
}

async function promover() {
  const { error } = await getSupabaseAdmin().rpc("promote_due_schedules", { max_schedules: 500 });
  if (error) throw new Error(error.message);
}

async function comandosDa(broadcastId: string, tenant = TENANT) {
  const { count, error } = await getSupabaseAdmin()
    .from("engine_commands")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant)
    .eq("origin_id", broadcastId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

test("agendamento único que perdeu a hora não enfileira e vira failed com motivo", async () => {
  if (pular()) return;
  const { broadcastId, scheduleId } = await criarAgendamento(DUAS_HORAS_ATRAS(), "none");

  await promover();

  const supabase = getSupabaseAdmin();
  const { data: s } = await supabase
    .from("schedules").select("status").eq("tenant_id", TENANT).eq("id", scheduleId).single();
  assert.equal(s!.status, "failed");

  const { data: b } = await supabase
    .from("broadcasts").select("status, error").eq("tenant_id", TENANT).eq("id", broadcastId).single();
  assert.equal(b!.status, "failed");
  assert.match(b!.error ?? "", /perdeu o horário/);
  assert.equal(await comandosDa(broadcastId), 0);
});

test("agendamento recorrente que perdeu a hora só avança a data, sem enviar", async () => {
  if (pular()) return;
  const agendadoEm = DUAS_HORAS_ATRAS();
  const { broadcastId, scheduleId } = await criarAgendamento(agendadoEm, "daily");

  await promover();

  const { data: s } = await getSupabaseAdmin()
    .from("schedules")
    .select("status, scheduled_at")
    .eq("tenant_id", TENANT)
    .eq("id", scheduleId)
    .single();
  assert.equal(s!.status, "pending");
  assert.equal(new Date(s!.scheduled_at).getTime(), new Date(agendadoEm).getTime() + 24 * HORA_MS);
  assert.equal(await comandosDa(broadcastId), 0);
});

test("agendamento dentro da tolerância segue o caminho normal", async () => {
  if (pular()) return;
  const { scheduleId } = await criarAgendamento(new Date(Date.now() - MIN_MS).toISOString(), "none");

  await promover();

  const { data: s } = await getSupabaseAdmin()
    .from("schedules").select("status").eq("tenant_id", TENANT).eq("id", scheduleId).single();
  // 'done' mesmo que o broadcast falhe por falta de número conectado no QA: o
  // que importa aqui é que ele foi promovido, não descartado como atrasado.
  assert.equal(s!.status, "done");
});

/**
 * C17 (auditoria 16/10/2026): cancelar ou ficar inadimplente não parava o
 * recorrente, que voltava todo dia. A regra é `app.tenant_concede_plano`, espelho
 * de `subscriptionAccess` — travado sem banco em subscription-access-espelho.test.ts.
 */
async function lojaComAssinatura(status: "canceled" | "trialing"): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!lojaDoPlano) {
    const { data, error } = await supabase
      .from("organizations")
      .insert({ name: `sem-plano ${RUN}`, slug: `sem-plano-${RUN}` })
      .select("id")
      .single();
    if (error) throw new Error(`organizations: ${error.message}`);
    lojaDoPlano = data!.id as string;
  }
  const { data: plano, error: ep } = await supabase.from("plans").select("id").limit(1).single();
  if (ep) throw new Error(`plans: ${ep.message}`);
  const { error } = await supabase
    .from("subscriptions")
    .upsert({ tenant_id: lojaDoPlano, plan_id: plano!.id, status }, { onConflict: "tenant_id" });
  if (error) throw new Error(`subscriptions: ${error.message}`);
  return lojaDoPlano;
}

async function lerAgendamento(tenant: string, scheduleId: string, broadcastId: string) {
  const supabase = getSupabaseAdmin();
  const { data: s } = await supabase
    .from("schedules").select("status, scheduled_at").eq("tenant_id", tenant).eq("id", scheduleId).single();
  const { data: b } = await supabase
    .from("broadcasts").select("status, error").eq("tenant_id", tenant).eq("id", broadcastId).single();
  return { agendamento: s!, disparo: b! };
}

test("loja que cancelou: o recorrente vencido não enfileira, não toca o disparo e só avança a data", async () => {
  if (pular()) return;
  const loja = await lojaComAssinatura("canceled");
  const agendadoEm = new Date(Date.now() - MIN_MS).toISOString();
  const { broadcastId, scheduleId } = await criarAgendamento(agendadoEm, "daily", loja);

  await promover();

  const { agendamento, disparo } = await lerAgendamento(loja, scheduleId, broadcastId);
  assert.equal(agendamento.status, "pending");
  assert.equal(new Date(agendamento.scheduled_at).getTime(), new Date(agendadoEm).getTime() + 24 * HORA_MS);
  // Mutante: chamar o enqueue mesmo assim deixa o disparo 'failed' todo dia (a
  // loja não tem número), e o e-mail de "disparo falho" iria todo dia ao ex-cliente.
  assert.equal(disparo.status, "draft");
  assert.equal(disparo.error ?? null, null);
  assert.equal(await comandosDa(broadcastId, loja), 0);
});

test("loja que cancelou: o agendamento único vira failed com o motivo da assinatura", async () => {
  if (pular()) return;
  const loja = await lojaComAssinatura("canceled");
  const { broadcastId, scheduleId } = await criarAgendamento(new Date(Date.now() - MIN_MS).toISOString(), "none", loja);

  await promover();

  const { agendamento, disparo } = await lerAgendamento(loja, scheduleId, broadcastId);
  assert.equal(agendamento.status, "failed");
  assert.equal(disparo.status, "failed");
  assert.match(disparo.error ?? "", /assinatura não está ativa/);
  assert.equal(await comandosDa(broadcastId, loja), 0);
});

test("loja em teste grátis segue o caminho normal", async () => {
  if (pular()) return;
  const loja = await lojaComAssinatura("trialing");
  const { broadcastId, scheduleId } = await criarAgendamento(new Date(Date.now() - MIN_MS).toISOString(), "none", loja);

  await promover();

  const { agendamento, disparo } = await lerAgendamento(loja, scheduleId, broadcastId);
  // Promovido: o enqueue rodou (e falhou por falta de número, como no QA), não
  // foi barrado como loja sem plano.
  assert.equal(agendamento.status, "done");
  assert.doesNotMatch(disparo.error ?? "", /assinatura/);
});

/**
 * O tenant de QA não tem número (e os e2e contam com isso). Cada teste de fila
 * cria um só para ele e apaga no fim; os comandos e envios do número vão junto
 * (on delete cascade).
 */
async function comNumeroTemporario(usar: (instanceId: string) => Promise<void>) {
  const supabase = getSupabaseAdmin();
  const { data: inst, error } = await supabase
    .from("instances")
    .insert({ tenant_id: TENANT, name: `perdeu-hora-${RUN}`, status: "disconnected" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  try {
    await usar(inst!.id as string);
  } finally {
    await supabase.from("instances").delete().eq("tenant_id", TENANT).eq("id", inst!.id);
  }
}

async function comandoParadoNaFila(instanceId: string): Promise<string> {
  const { data: cmd, error } = await getSupabaseAdmin()
    .from("engine_commands")
    .insert({
      tenant_id: TENANT,
      instance_id: instanceId,
      type: "send_message",
      status: "queued",
      payload: { jid: `perdeu-hora-${RUN}@g.us`, text: "teste" },
      available_at: DUAS_HORAS_ATRAS(),
      // Prioridade mínima: se a fila do QA andar, este é o último a ser reivindicado.
      priority: 32_000,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return cmd!.id as string;
}

async function statusDepoisDoClaim(commandId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc("claim_send_commands", { max_commands: 1, p_tenant: TENANT });
  if (error) throw new Error(error.message);
  const { data } = await supabase
    .from("engine_commands").select("status, error").eq("tenant_id", TENANT).eq("id", commandId).single();
  return data!;
}

test("envio parado na fila de número sem envio recente é cancelado, não sai atrasado", async () => {
  if (pular()) return;
  await comNumeroTemporario(async (instanceId) => {
    const depois = await statusDepoisDoClaim(await comandoParadoNaFila(instanceId));
    assert.equal(depois.status, "canceled");
    assert.match(depois.error ?? "", /parado na fila/);
  });
});

test("número com envio recente é fila andando sob o anti-ban: o comando antigo não expira", async () => {
  if (pular()) return;
  await comNumeroTemporario(async (instanceId) => {
    const { error } = await getSupabaseAdmin().from("instance_sends").insert({ instance_id: instanceId });
    if (error) throw new Error(error.message);
    const depois = await statusDepoisDoClaim(await comandoParadoNaFila(instanceId));
    assert.notEqual(depois.status, "canceled");
  });
});
