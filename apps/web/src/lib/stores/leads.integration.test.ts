import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { countEntriesByGroupSince, countEntriesSince, countLeads, listLatestEntries } from "./leads";

/**
 * Contra o Supabase de DEV. A página da campanha lia as entradas na lista de
 * /api/leads, que o PostgREST corta em 1000 linhas sem erro: em produção, 1503
 * pessoas novas numa campanha viravam no máximo 1000, e campanha quieta numa
 * loja grande ficava sem "Últimas entradas". Array em memória nunca chega nesse
 * teto; só o banco, acima dele, prova que a leitura não para lá.
 */

const TENANT = process.env.E2E_TENANT_ID ?? "";
// Estas linhas são do tenant de QA: apontado para produção, o teste não roda.
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
// Grupos só deste run: dois runs ao mesmo tempo não apagam as linhas um do outro.
const RUN = randomUUID().slice(0, 8);
const GRUPO_A = `cnttest-${RUN}-a@g.us`;
const GRUPO_B = `cnttest-${RUN}-b@g.us`;
const GRUPO_C = `cnttest-${RUN}-c@g.us`;
const FORA = `cnttest-${RUN}-fora@g.us`;
// Em 2020: longe do "hoje" e do "recente" que as telas do tenant de E2E mostram.
const DESDE = "2020-01-10T00:00:00.000Z";
const DEPOIS = "2020-01-15T12:00:00.000Z";
const ANTES = "2020-01-05T12:00:00.000Z";
// Depois de tudo que entra nos grupos da campanha.
const MAIS_TARDE = "2020-01-20T12:00:00.000Z";
// 1001 no pool: o mínimo acima do teto, e cada linha a mais pesa no tenant de QA.
const TOTAL_A = 601;
const TOTAL_B = 400;
const ANTES_DA_CAMPANHA = 5;
// 1000 mais novas que qualquer entrada da campanha: o caso da campanha quieta,
// que não aparecia entre as 1000 leads mais novas da loja.
const NO_OUTRO_GRUPO = 1000;
// Nome e hora distintos, num grupo só delas: a ordem e os campos da lista.
const NOMEADAS = [
  { name: "Ana Paula Souza", entered_at: "2020-01-16T10:00:00.000Z" },
  { name: "Bia Lima", entered_at: "2020-01-16T11:00:00.000Z" },
  { name: null, entered_at: "2020-01-16T12:00:00.000Z" },
];

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

// Sem telefone: o índice único de leads é por telefone, e @lid sem número é real.
function linhas(grupo: string, quantidade: number, enteredAt: string) {
  return Array.from({ length: quantidade }, () => ({
    tenant_id: TENANT,
    phone: null,
    source_group_id: grupo,
    entered_at: enteredAt,
  }));
}

async function limpar() {
  const { error } = await getSupabaseAdmin()
    .from("leads")
    .delete()
    .eq("tenant_id", TENANT)
    .in("source_group_id", [GRUPO_A, GRUPO_B, GRUPO_C, FORA]);
  if (error) throw new Error(error.message);
}

before(async () => {
  if (!TENANT || EM_PRODUCAO) return;
  const { error } = await getSupabaseAdmin()
    .from("leads")
    .insert([
      ...linhas(GRUPO_A, TOTAL_A, DEPOIS),
      ...linhas(GRUPO_B, TOTAL_B, DEPOIS),
      ...linhas(GRUPO_A, ANTES_DA_CAMPANHA, ANTES),
      ...linhas(FORA, NO_OUTRO_GRUPO, MAIS_TARDE),
      ...NOMEADAS.map((l) => ({ ...l, tenant_id: TENANT, phone: null, source_group_id: GRUPO_C, source_group_name: "VIP teste" })),
    ]);
  if (error) throw new Error(error.message);
});

after(async () => {
  if (TENANT && !EM_PRODUCAO) await limpar();
});

test("conta acima de 1000 entradas somando dois grupos, sem parar no teto", async (t) => {
  if (pular()) return t.skip();

  // Nenhum grupo sozinho passa de 1000: é o total da campanha que passa.
  assert.equal(await countEntriesSince(TENANT, [GRUPO_A, GRUPO_B], DESDE), TOTAL_A + TOTAL_B);
});

test("quem entrou antes da campanha existir fica de fora", async (t) => {
  if (pular()) return t.skip();

  assert.equal(await countEntriesSince(TENANT, [GRUPO_A], DESDE), TOTAL_A);
  assert.equal(await countEntriesSince(TENANT, [GRUPO_A], "2019-01-01T00:00:00.000Z"), TOTAL_A + ANTES_DA_CAMPANHA);
});

test("outra loja com os mesmos grupos não vê estas entradas", async (t) => {
  if (pular()) return t.skip();

  // O service-role passa por cima do RLS: é o filtro de tenant que isola.
  const outraLoja = randomUUID();
  assert.equal(await countEntriesSince(outraLoja, [GRUPO_A, GRUPO_B], DESDE), 0);
  assert.equal((await countEntriesByGroupSince(outraLoja, [GRUPO_A, GRUPO_B], DESDE)).size, 0);
  assert.equal((await listLatestEntries(outraLoja, [GRUPO_A, GRUPO_C], 5)).length, 0);
});

test("por grupo, soma acima de 1000 sem parar na 1ª página", async (t) => {
  if (pular()) return t.skip();

  // Uma página só daria 1000 no total; o grupo de fora e quem entrou antes ficam de fora.
  const porGrupo = await countEntriesByGroupSince(TENANT, [GRUPO_A, GRUPO_B], DESDE);
  assert.deepEqual(Object.fromEntries(porGrupo), { [GRUPO_A]: TOTAL_A, [GRUPO_B]: TOTAL_B });
});

test("últimas entradas: as mais novas dos grupos da campanha, sem telefone", async (t) => {
  if (pular()) return t.skip();

  const ultimas = await listLatestEntries(TENANT, [GRUPO_A, GRUPO_C], 2);
  assert.deepEqual(ultimas.map((l) => l.name), [null, "Bia Lima"]);
  assert.deepEqual(ultimas.map((l) => Date.parse(l.entered_at)), [NOMEADAS[2].entered_at, NOMEADAS[1].entered_at].map(Date.parse));
  assert.ok(ultimas.every((l) => l.source_group_name === "VIP teste" && !("phone" in l)));
});

test("campanha quieta: acha as entradas dela mesmo com 1000 leads mais novas na loja", async (t) => {
  if (pular()) return t.skip();

  // As 1000 do grupo de fora são mais novas que qualquer entrada do grupo A.
  const ultimas = await listLatestEntries(TENANT, [GRUPO_A], 5);
  assert.equal(ultimas.length, 5);
  assert.ok(ultimas.every((l) => Date.parse(l.entered_at) === Date.parse(DEPOIS)));
});

test("a loja inteira conta acima de 1000, e clientes só quem comprou", async (t) => {
  if (pular()) return t.skip();

  // Resultados e o cancelamento contavam a lista de /api/leads, que para em 1000.
  const deste = TOTAL_A + TOTAL_B + ANTES_DA_CAMPANHA + NO_OUTRO_GRUPO + NOMEADAS.length;
  const total = await countLeads(TENANT);
  assert.ok(total >= deste, `a conta parou em ${total}, abaixo das ${deste} linhas deste run`);
  // As linhas deste run nascem 'novo': nenhuma delas pode entrar em clientes.
  assert.ok((await countLeads(TENANT, "comprou")) <= total - deste);
  assert.equal(await countLeads(randomUUID()), 0);
});
