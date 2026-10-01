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
const commandIds: string[] = [];

after(async () => {
  if (!TENANT || EM_PRODUCAO) return;
  const supabase = getSupabaseAdmin();
  if (commandIds.length) await supabase.from("engine_commands").delete().in("id", commandIds);
  if (broadcastIds.length) {
    await supabase.from("engine_commands").delete().in("origin_id", broadcastIds);
  }
  if (scheduleIds.length) await supabase.from("schedules").delete().in("id", scheduleIds);
  if (broadcastIds.length) await supabase.from("broadcasts").delete().in("id", broadcastIds);
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

async function criarAgendamento(scheduledAt: string, recurrence: "none" | "daily") {
  const supabase = getSupabaseAdmin();
  const { data: b, error: eb } = await supabase
    .from("broadcasts")
    .insert({ tenant_id: TENANT, name: `perdeu-hora-${RUN}`, message: "teste", status: "draft" })
    .select("id")
    .single();
  if (eb) throw new Error(eb.message);
  broadcastIds.push(b!.id);

  const { data: s, error: es } = await supabase
    .from("schedules")
    .insert({
      tenant_id: TENANT,
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

async function comandosDa(broadcastId: string) {
  const { count, error } = await getSupabaseAdmin()
    .from("engine_commands")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", TENANT)
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

test("envio parado na fila de número sem envio recente é cancelado, não sai atrasado", async () => {
  if (pular()) return;
  const supabase = getSupabaseAdmin();
  const { data: inst, error: ei } = await supabase
    .from("instances").select("id").eq("tenant_id", TENANT).limit(1).maybeSingle();
  if (ei) throw new Error(ei.message);
  if (!inst) throw new Error("o tenant de QA não tem instância nenhuma");

  const { count: enviosRecentes, error: eir } = await supabase
    .from("instance_sends")
    .select("instance_id", { count: "exact", head: true })
    .eq("instance_id", inst.id)
    .gt("sent_at", new Date(Date.now() - 15 * MIN_MS).toISOString());
  if (eir) throw new Error(eir.message);

  const { data: cmd, error: ec } = await supabase
    .from("engine_commands")
    .insert({
      tenant_id: TENANT,
      instance_id: inst.id,
      type: "send_message",
      status: "queued",
      payload: { jid: `perdeu-hora-${RUN}@g.us`, text: "teste" },
      available_at: DUAS_HORAS_ATRAS(),
      // Prioridade mínima: se a fila do QA andar, este é o último a ser reivindicado.
      priority: 32_000,
    })
    .select("id")
    .single();
  if (ec) throw new Error(ec.message);
  commandIds.push(cmd!.id);

  const { error } = await supabase.rpc("claim_send_commands", { max_commands: 1, p_tenant: TENANT });
  if (error) throw new Error(error.message);

  const { data: depois } = await supabase
    .from("engine_commands").select("status, error").eq("tenant_id", TENANT).eq("id", cmd!.id).single();

  if ((enviosRecentes ?? 0) > 0) {
    // Número enviando agora: é fila andando sob o anti-ban, não pode expirar.
    assert.notEqual(depois!.status, "canceled");
  } else {
    assert.equal(depois!.status, "canceled");
    assert.match(depois!.error ?? "", /parado na fila/);
  }
});
