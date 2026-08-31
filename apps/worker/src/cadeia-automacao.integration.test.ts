/**
 * Teste de INTEGRAÇÃO da cadeia de automação, contra o Supabase de dev.
 *
 * Existe por causa de 19/08/2026. Naquele dia a automação "Grupo lotou"
 * disparou, o run ficou `done` sem erro — e a mensagem nunca chegou. Cada elo
 * da cadeia tinha teste de unidade verde: 9 no gatilho, 11 no executor, mais
 * quatro arquivos no envio. Todos passavam.
 *
 * O defeito não estava DENTRO de nenhum elo, estava ENTRE dois: `enqueueMessage`
 * gravava `instance_id: null` e `app.claim_send_commands` filtra
 * `cand.instance_id is not null`. O comando entrava na fila e nunca saía — sem
 * erro, sem tentativa, sem nada em lugar nenhum para reclamar.
 *
 * Nenhum teste com Supabase fake pode pegar isso, porque o fake não tem a RPC
 * real com o filtro real. Por isso este é o primeiro teste do worker a falar
 * com um banco de verdade.
 *
 * SEGURANÇA — por que isto não manda mensagem para ninguém:
 *  1. Nenhum `EvolutionSender` é construído aqui. Não existe caminho para a
 *     Evolution neste arquivo, o que é mais forte que rodar em dry-run.
 *  2. Os fixtures vivem num tenant com UUID novo a cada execução, então o
 *     gatilho só enxerga o grupo criado por este teste — `listGroupsByTenant`
 *     indexa por tenant, e automação só casa grupo do próprio tenant.
 *  3. O grupo fixture usa members=2/capacity=2. O gate de `group_full` é
 *     `members >= capacity`, então números pequenos exercem o gatilho igual e
 *     deixam claro que não há 1024 pessoas do outro lado.
 *
 * O CLAIM É ESCOPADO POR TENANT desde 31/08/2026. Antes disso `claim_send_commands`
 * e `claim_automation_runs` reivindicavam de uma fila global, e um segundo run do
 * CI roubava o comando deste aqui — o elo 2 reprovava sem haver nada errado no
 * código (aconteceu em 24/08/2026 com os PRs #143 e #144, mergeados com 4
 * segundos de diferença). A contramedida era serializar o job `e2e` num
 * `concurrency` global, o que fazia um PR CANCELAR o e2e do outro. As duas RPCs
 * agora aceitam `p_tenant` (migração 20260831160000), este teste passa o dele, e
 * a serialização saiu do workflow. Produção não passa o parâmetro e segue
 * reivindicando da fila inteira.
 *
 * Pula-se sozinho sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, para `npm test`
 * seguir verde na máquina de quem não configurou credencial.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { makeScanDeps, runAutomationScansTick } from "./automation-scans.js";
import { makeAutomationDeps, runAutomationsTick } from "./automations-loop.js";
import { createSupabaseClient } from "./supabase.js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const semCredencial = !url || !serviceKey;

/**
 * Guarda contra rodar em produção por acidente. O projeto de prod é
 * `nidoatbxaylrkcgbszns`; este teste ESCREVE, então recusa essa URL em vez de
 * confiar em quem exportou a variável.
 */
const PROJETO_PROD = "nidoatbxaylrkcgbszns";
if (!semCredencial && url.includes(PROJETO_PROD)) {
  throw new Error(
    "cadeia-automacao.integration.test: SUPABASE_URL aponta para PRODUCAO. " +
      "Este teste cria e apaga dados — rode contra o Supabase de dev.",
  );
}

const tenantId = randomUUID();
const marcador = tenantId.slice(0, 8);
const grupoJid = "12036300000" + marcador + "@g.us";
const TEXTO = "fixture de teste automatizado — nao enviar";

const supabase = semCredencial ? null : createSupabaseClient(url, serviceKey);

after(async () => {
  if (!supabase) return;
  // Ordem importa: comandos e runs apontam para automação/tenant.
  await supabase.from("engine_commands").delete().eq("tenant_id", tenantId);
  await supabase.from("automation_runs").delete().eq("tenant_id", tenantId);
  await supabase.from("groups").delete().eq("tenant_id", tenantId);
  await supabase.from("instances").delete().eq("tenant_id", tenantId);
  await supabase.from("automations").delete().eq("tenant_id", tenantId);
  await supabase.from("organizations").delete().eq("tenant_id", tenantId);
});

test(
  "cadeia de automacao: grupo lotado vira comando de envio reivindicavel",
  { skip: semCredencial ? "faltam SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY" : false },
  async (t) => {
    const db = supabase as NonNullable<typeof supabase>;

    await t.test("fixtures: tenant isolado com grupo lotado e instancia provisionada", async () => {
      // `id` explícito: a CHECK `organizations_tenant_id_matches_id` exige
      // id = tenant_id. Deixar o default gerar o id faz o insert falhar com 23514.
      const org = await db.from("organizations").insert({
        id: tenantId,
        tenant_id: tenantId,
        name: "QA cadeia " + marcador,
        slug: "qa-cadeia-" + marcador,
      });
      assert.equal(org.error, null, "organizations: " + org.error?.message);

      // provider_instance_id preenchido é requisito de pickSendInstance: sem
      // ele a instância é descartada e o run falha antes de enfileirar.
      const instancia = await db.from("instances").insert({
        tenant_id: tenantId,
        name: "qa-" + marcador,
        status: "connected",
        provider_instance_id: "qa-" + marcador,
      });
      assert.equal(instancia.error, null, "instances: " + instancia.error?.message);

      // is_admin=true é o filtro anti-ban: grupo de terceiro nunca dispara.
      const grupo = await db.from("groups").insert({
        tenant_id: tenantId,
        whatsapp_group_id: grupoJid,
        name: "Grupo QA " + marcador,
        members: 2,
        capacity: 2,
        is_admin: true,
      });
      assert.equal(grupo.error, null, "groups: " + grupo.error?.message);

      // Um único passo `message`, sem `wait`: o run precisa fechar dentro de um
      // tick. Com um wait de 5 min o teste teria que dormir ou mexer no relógio.
      const automacao = await db.from("automations").insert({
        tenant_id: tenantId,
        name: "QA grupo lotou " + marcador,
        trigger: "group_full",
        enabled: true,
        steps: [{ id: "step-1", type: "message", message: TEXTO, delay_minutes: 0 }],
      });
      assert.equal(automacao.error, null, "automations: " + automacao.error?.message);
    });

    await t.test("elo 1 — a varredura enxerga o grupo lotado e cria o run", async () => {
      const resumo = await runAutomationScansTick(makeScanDeps(db));
      assert.ok(
        resumo.groupFullCreated >= 1,
        "esperava ao menos 1 run de group_full, veio " + resumo.groupFullCreated,
      );

      const { data, error } = await db
        .from("automation_runs")
        .select("id, status, target_group_jid, dedupe_key")
        .eq("tenant_id", tenantId);
      assert.equal(error, null, error?.message);
      assert.equal(data?.length, 1, "o tenant fixture deve ter exatamente 1 run");
      assert.equal(data?.[0].target_group_jid, grupoJid, "o run tem que mirar o grupo fixture");
    });

    await t.test("elo 2 — o executor enfileira o comando COM instance_id", async () => {
      const resumo = await runAutomationsTick(db, makeAutomationDeps(db), 20, 300, tenantId);
      assert.ok(resumo.claimed >= 1, "esperava ao menos 1 run reivindicado, veio " + resumo.claimed);

      const { data, error } = await db
        .from("engine_commands")
        .select("id, status, instance_id, type, payload, dedupe_key")
        .eq("tenant_id", tenantId);
      assert.equal(error, null, error?.message);
      assert.equal(data?.length, 1, "esperava exatamente 1 comando enfileirado");

      const comando = data?.[0] as {
        status: string;
        instance_id: string | null;
        type: string;
        payload: { jid?: string; text?: string };
      };
      assert.equal(comando.type, "send_message");
      assert.equal(
        comando.status,
        "queued",
        comando.status === "processing"
          ? "comando sumiu antes da conferencia. Desde 31/08/2026 o claim e escopado por tenant (p_tenant), entao NAO deveria mais ser outro run do CI roubando: investigar de verdade em vez de reexecutar."
          : "o comando nasceu em " + comando.status + ", esperava queued",
      );
      // ESTE é o assert que teria pego o bug de 19/08.
      assert.notEqual(
        comando.instance_id,
        null,
        "comando sem instance_id: claim_send_commands descarta e ele fica preso em queued para sempre",
      );
      assert.equal(comando.payload.jid, grupoJid, "o comando tem que ir para o grupo, nunca para um numero");
      assert.ok(comando.payload.jid?.endsWith("@g.us"), "destino precisa ser grupo (anti-ban: nunca DM)");
      assert.equal(comando.payload.text, TEXTO);
    });

    await t.test("elo 3 — claim_send_commands REIVINDICA o comando", async () => {
      // O elo que faltava. Os testes de unidade paravam no insert; o defeito de
      // 19/08 morava aqui, no filtro da RPC que nenhum fake reproduz.
      const { data, error } = await db.rpc("claim_send_commands", { max_commands: 20, p_tenant: tenantId });
      assert.equal(error, null, "claim_send_commands: " + error?.message);

      const reivindicados = ((data ?? []) as { id: string; tenant_id: string; status: string }[]).filter(
        (linha) => linha.tenant_id === tenantId,
      );

      assert.equal(
        reivindicados.length,
        1,
        "o comando do tenant fixture nao foi reivindicado — cadeia quebrada entre o executor e o envio",
      );
      assert.equal(reivindicados[0].status, "processing");
    });

    await t.test("o run fecha como done no ciclo seguinte, sem erro", async () => {
      // Um tick processa UM passo: o tick anterior enfileirou a mensagem e
      // chamou `advance`, devolvendo o run para `pending` com current_step=1.
      // Só no ciclo seguinte o executor vê current_step >= steps.length e
      // finaliza. Em produção o loop roda a cada 3s, então isto é o
      // comportamento real, não um artifício do teste — o run ficar `pending`
      // aqui é correto, e é por isso que o segundo tick existe.
      const resumo = await runAutomationsTick(db, makeAutomationDeps(db), 20, 300, tenantId);
      assert.ok(resumo.done >= 1, "esperava ao menos 1 run finalizado, veio " + resumo.done);

      const { data, error } = await db
        .from("automation_runs")
        .select("status, error, current_step")
        .eq("tenant_id", tenantId);
      assert.equal(error, null, error?.message);
      assert.equal(data?.[0].status, "done");
      assert.equal(data?.[0].error, null);
    });

    await t.test("o segundo ciclo nao duplicou o envio", async () => {
      // `enqueueMessage` é idempotente pelo dedupe_key `auto:<run>:<step>`.
      // Sem isso, cada requeue viraria uma mensagem a mais no grupo — o tipo de
      // falha que só aparece quando o cliente reclama.
      const { count, error } = await db
        .from("engine_commands")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      assert.equal(error, null, error?.message);
      assert.equal(count, 1, "a cadeia gerou mais de um comando para o mesmo passo");
    });
  },
);
