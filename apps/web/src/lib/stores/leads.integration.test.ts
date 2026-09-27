import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { countEntriesSince } from "./leads";

/**
 * Contra o Supabase de DEV. A página da campanha contava as entradas na lista de
 * /api/leads, que o PostgREST corta em 1000 linhas sem erro: em produção, 1503
 * pessoas novas numa campanha viravam no máximo 1000. Array em memória nunca
 * chega nesse teto; só a conta no banco, acima dele, prova que ela não para lá.
 */

const TENANT = process.env.E2E_TENANT_ID ?? "";
// Estas linhas são do tenant de QA: apontado para produção, o teste não roda.
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
// Grupos só deste run: dois runs ao mesmo tempo não apagam as linhas um do outro.
const RUN = randomUUID().slice(0, 8);
const GRUPO_A = `cnttest-${RUN}-a@g.us`;
const GRUPO_B = `cnttest-${RUN}-b@g.us`;
const FORA = `cnttest-${RUN}-fora@g.us`;
// Em 2020: longe do "hoje" e do "recente" que as telas do tenant de E2E mostram.
const DESDE = "2020-01-10T00:00:00.000Z";
const DEPOIS = "2020-01-15T12:00:00.000Z";
const ANTES = "2020-01-05T12:00:00.000Z";
// 1001 no pool: o mínimo acima do teto, e cada linha a mais pesa no tenant de QA.
const TOTAL_A = 601;
const TOTAL_B = 400;
const ANTES_DA_CAMPANHA = 5;
const NO_OUTRO_GRUPO = 5;

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
    .in("source_group_id", [GRUPO_A, GRUPO_B, FORA]);
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
      ...linhas(FORA, NO_OUTRO_GRUPO, DEPOIS),
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
  assert.equal(await countEntriesSince(randomUUID(), [GRUPO_A, GRUPO_B], DESDE), 0);
});
