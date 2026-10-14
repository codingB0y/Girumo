import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import type { RegraDestino } from "@/lib/groups/estado";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createBroadcast, enqueueBroadcast } from "./broadcasts";

/**
 * Contra o Supabase de DEV (job e2e do CI). A regra de destino vive no SQL
 * (`app.alvos_do_disparo` → `app.grupo_na_regra`) e o elo que a liga ao app é o
 * `target_rule` gravado por `createBroadcast`. Sem ele, o disparo cai no
 * predicado antigo — `group_ids` vazio = TODOS os grupos admin. Só o banco real
 * mostra isso (spec postar-por-grupo §8 e §11 item 2).
 */

const TENANT = process.env.E2E_TENANT_ID ?? "";
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);
const jid = (nome: string) => `destino-${RUN}-${nome}@g.us`;

// Na ordem do pool. O lotado vem marcado à mão (9 de 10 fica abaixo dos 95%),
// para o teste não depender do trigger da marca; o resto cai no estado pela
// contagem: o 1º disponível é o enchendo, 1 membro é vazio, sem admin sai das regras.
const GRUPOS = [
  { nome: "lotado", members: 9, capacity: 10, isAdmin: true, lotado: true },
  { nome: "enchendo", members: 5, capacity: 100, isAdmin: true, lotado: false },
  { nome: "fila", members: 5, capacity: 100, isAdmin: true, lotado: false },
  { nome: "vazio", members: 1, capacity: 100, isAdmin: true, lotado: false },
  { nome: "sem-admin", members: 5, capacity: 100, isAdmin: false, lotado: false },
];

const ESPERADO: Record<RegraDestino, string[]> = {
  menos_enchendo: [jid("lotado"), jid("fila")],
  lotados: [jid("lotado")],
  com_gente: [jid("lotado"), jid("enchendo"), jid("fila")],
};

let campanhaId = "";
let instanciaId = "";
const broadcastIds: string[] = [];

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

// Execução deste teste: `destino-<8 hex>` no nome do número, no slug, no nome do disparo e no
// JID (`destino-<8 hex>-<nome>@g.us`). Nada de outro teste cai neste formato.
const RUN_DO_TESTE = /^destino-([0-9a-f]{8})(?:-|$)/;
const DEZ_MINUTOS = 10 * 60_000;

type Falha = { message: string } | null;
const registrar = (falhas: string[], rotulo: string, error: Falha) => {
  if (error) falhas.push(`${rotulo}: ${error.message}`);
};

/**
 * Apaga o que uma execução anterior deste teste deixou no tenant de QA (runner morto entre
 * `before` e `after`: o verify.yml cancela PR obsoleto e o passo tem timeout). Um número
 * `connected` esquecido quebra os e2e de "sem número" com um sintoma enganoso.
 *
 * A idade só vale para DESCOBRIR a execução: ela é velha se o grupo ou o número dela é de
 * mais de 10 minutos (o passo morre em 3), então um run vivo de outro PR nunca entra. Achada
 * a execução, tudo dela sai pela chave única (`RUN`), sem filtro de idade: `campaign_groups`
 * nasce com `created_at` em 2020 (ver `before`), e um disparo dela pode ter menos de 10
 * minutos mesmo com o grupo velho — filtrar por idade deixaria órfão.
 */
async function varrerResquicios(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const antes = new Date(Date.now() - DEZ_MINUTOS).toISOString();

  const [grupos, instancias] = await Promise.all([
    supabase.from("groups").select("whatsapp_group_id").eq("tenant_id", TENANT).like("whatsapp_group_id", "destino-%").lt("created_at", antes),
    supabase.from("instances").select("name").eq("tenant_id", TENANT).like("name", "destino-%").lt("created_at", antes),
  ]);
  if (grupos.error) throw new Error(`varredura (groups): ${grupos.error.message}`);
  if (instancias.error) throw new Error(`varredura (instances): ${instancias.error.message}`);

  const runs = new Set<string>();
  const nomes = [
    ...(grupos.data ?? []).map((g) => String(g.whatsapp_group_id)),
    ...(instancias.data ?? []).map((i) => String(i.name)),
  ];
  for (const nome of nomes) {
    const run = RUN_DO_TESTE.exec(nome)?.[1];
    if (run) runs.add(run);
  }

  const falhas: string[] = [];
  for (const run of runs) {
    const chave = `destino-${run}`;
    const { data: disparos, error: erroDisparos } = await supabase
      .from("broadcasts")
      .select("id")
      .eq("tenant_id", TENANT)
      .eq("name", chave);
    registrar(falhas, `broadcasts ${chave}`, erroDisparos);
    const ids = (disparos ?? []).map((b) => b.id as string);
    if (ids.length) {
      registrar(falhas, `engine_commands ${chave}`, (await supabase.from("engine_commands").delete().eq("tenant_id", TENANT).in("origin_id", ids)).error);
      registrar(falhas, `broadcasts ${chave}`, (await supabase.from("broadcasts").delete().eq("tenant_id", TENANT).in("id", ids)).error);
    }
    registrar(falhas, `instances ${chave}`, (await supabase.from("instances").delete().eq("tenant_id", TENANT).eq("name", chave)).error);
    registrar(falhas, `campaign_groups ${chave}`, (await supabase.from("campaign_groups").delete().eq("tenant_id", TENANT).eq("slug", chave)).error);
    registrar(falhas, `groups ${chave}`, (await supabase.from("groups").delete().eq("tenant_id", TENANT).like("whatsapp_group_id", `${chave}-%`)).error);
  }
  if (falhas.length) throw new Error(`varredura incompleta:\n${falhas.join("\n")}`);
}

before(async () => {
  if (pular()) return;
  await varrerResquicios();
  const supabase = getSupabaseAdmin();
  const agora = new Date().toISOString();

  const { error: erroGrupos } = await supabase.from("groups").insert(
    GRUPOS.map((g) => ({
      tenant_id: TENANT,
      whatsapp_group_id: jid(g.nome),
      name: `destino ${RUN} ${g.nome}`,
      members: g.members,
      capacity: g.capacity,
      is_admin: g.isAdmin,
      invite_url: `https://chat.whatsapp.com/destino${RUN}${g.nome.replace("-", "")}`,
      ...(g.lotado ? { lotado_em: agora, lotado_por: "manual" } : {}),
    })),
  );
  if (erroGrupos) throw new Error(erroGrupos.message);

  // Em 2020: longe da lista de campanhas que as telas do QA mostram primeiro.
  const { data: campanha, error: erroCampanha } = await supabase
    .from("campaign_groups")
    .insert({
      tenant_id: TENANT,
      name: `destino-${RUN}`,
      slug: `destino-${RUN}`,
      group_ids: GRUPOS.map((g) => jid(g.nome)),
      created_at: "2020-01-01T00:00:00.000Z",
    })
    .select("id")
    .single();
  if (erroCampanha) throw new Error(erroCampanha.message);
  campanhaId = campanha!.id as string;

  // O QA não tem número (os e2e de "sem número" contam com isso): este é só do
  // teste. Conectado, porque `enqueue_broadcast` só resolve destino com número;
  // pausado, para nenhum claim (worker de dev, schedules.integration em
  // paralelo) levar os comandos antes da conferência.
  const { data: instancia, error: erroInstancia } = await supabase
    .from("instances")
    .insert({
      tenant_id: TENANT,
      name: `destino-${RUN}`,
      status: "connected",
      provider_instance_id: `destino-${RUN}`,
      connected_at: agora,
    })
    .select("id")
    .single();
  if (erroInstancia) throw new Error(erroInstancia.message);
  instanciaId = instancia!.id as string;

  const { error: erroPausa } = await supabase
    .from("instance_send_state")
    .upsert(
      { instance_id: instanciaId, tenant_id: TENANT, paused_until: new Date(Date.now() + 3_600_000).toISOString() },
      { onConflict: "instance_id" },
    );
  if (erroPausa) throw new Error(erroPausa.message);
});

after(async () => {
  if (!TENANT || EM_PRODUCAO) return;
  const supabase = getSupabaseAdmin();
  // Tenta todos, mesmo que um falhe: parar no primeiro deixaria número conectado no dev.
  const falhas: string[] = [];
  if (broadcastIds.length) {
    registrar(falhas, "engine_commands", (await supabase.from("engine_commands").delete().eq("tenant_id", TENANT).in("origin_id", broadcastIds)).error);
    registrar(falhas, "broadcasts", (await supabase.from("broadcasts").delete().eq("tenant_id", TENANT).in("id", broadcastIds)).error);
  }
  // Comandos e estado de envio do número caem junto (on delete cascade).
  if (instanciaId) registrar(falhas, "instances", (await supabase.from("instances").delete().eq("tenant_id", TENANT).eq("id", instanciaId)).error);
  if (campanhaId) registrar(falhas, "campaign_groups", (await supabase.from("campaign_groups").delete().eq("tenant_id", TENANT).eq("id", campanhaId)).error);
  registrar(falhas, "groups", (await supabase.from("groups").delete().eq("tenant_id", TENANT).in("whatsapp_group_id", GRUPOS.map((g) => jid(g.nome)))).error);
  if (falhas.length) throw new Error(`limpeza incompleta:\n${falhas.join("\n")}`);
});

async function jidsDoRun(runId: string): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("engine_commands")
    .select("payload")
    .eq("tenant_id", TENANT)
    .eq("origin_run_id", runId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => String((c.payload as { jid?: unknown }).jid)).sort();
}

for (const regra of ["menos_enchendo", "lotados", "com_gente"] as const) {
  test(`regra ${regra}: o run manda exatamente para os grupos dela`, async () => {
    if (pular()) return;
    const criado = await createBroadcast(TENANT, {
      campaign_group_id: campanhaId,
      name: `destino-${RUN}`,
      message: "teste de destino",
      group_ids: [],
      target_rule: regra,
    });
    broadcastIds.push(criado.id);
    assert.equal(criado.target_rule, regra);

    const enfileirado = await enqueueBroadcast(TENANT, criado.id);
    assert.equal(enfileirado?.status, "queued", enfileirado?.error ?? "sem erro");
    // O enchendo fica fora de "menos_enchendo"; o sem-admin e o vazio, de todas.
    assert.deepEqual(await jidsDoRun(enfileirado!.run_id!), [...ESPERADO[regra]].sort());
    assert.equal(enfileirado?.total, ESPERADO[regra].length);
  });
}

test("lista fixa vai só para a lista, inclusive o grupo que está enchendo (D6)", async () => {
  if (pular()) return;
  const criado = await createBroadcast(TENANT, {
    campaign_group_id: campanhaId,
    name: `destino-${RUN}`,
    message: "teste de lista fixa",
    group_ids: [jid("enchendo")],
  });
  broadcastIds.push(criado.id);
  assert.equal(criado.target_rule, null);

  const enfileirado = await enqueueBroadcast(TENANT, criado.id);
  assert.deepEqual(await jidsDoRun(enfileirado!.run_id!), [jid("enchendo")]);
});

test("regra sem campanha (campanha apagada) falha com o motivo e nunca vira 'todos'", async () => {
  if (pular()) return;
  const criado = await createBroadcast(TENANT, {
    name: `destino-${RUN}`,
    message: "teste sem campanha",
    group_ids: [],
    target_rule: "menos_enchendo",
  });
  broadcastIds.push(criado.id);

  const enfileirado = await enqueueBroadcast(TENANT, criado.id);
  assert.equal(enfileirado?.status, "failed");
  assert.match(enfileirado?.error ?? "", /Nenhum grupo nesta regra agora\./);
  const { count, error } = await getSupabaseAdmin()
    .from("engine_commands")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", TENANT)
    .eq("origin_id", criado.id);
  if (error) throw new Error(error.message);
  assert.equal(count, 0);
});
