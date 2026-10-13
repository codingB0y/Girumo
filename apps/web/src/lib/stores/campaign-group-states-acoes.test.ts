import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type * as Loja from "./campaign-group-states";

/**
 * O cliente real do Supabase conversando com um PostgREST de mentira (técnica do
 * `leads.test.ts`): a chamada que sai daqui é a de produção, só a rede é trocada. Prova o
 * nome de cada RPC, os nomes dos parâmetros (`p_tenant`/`p_group`, contratos §1) e que um
 * resultado fora do contrato vira erro em vez de virar 200 ou 404 na rota.
 *
 * O SQL de verdade (tenant no `where`, limiar, prioridade) é provado no
 * `campaign-group-states.integration.test.ts`, contra o banco de dev.
 */

type Pedido = { metodo: string; caminho: string; corpo: unknown };
type Resposta = { status: number; corpo: unknown };

const pedidos: Pedido[] = [];
let responder: () => Resposta = () => ({ status: 500, corpo: { message: "sem resposta configurada" } });

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => {
    bruto += parte.toString("utf8");
  });
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://postgrest.falso");
    pedidos.push({ metodo: req.method ?? "", caminho: url.pathname, corpo: bruto ? JSON.parse(bruto) : null });
    const { status, corpo } = responder();
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(corpo));
  });
});

let loja: typeof Loja;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  // Depois do env: o cliente admin nasce na primeira chamada e guarda a URL.
  loja = await import("./campaign-group-states");
});

after(() => {
  postgrest.close();
});

test("marcar chama marcar_grupo_lotado com p_tenant e p_group e devolve o que o banco disse", async () => {
  pedidos.length = 0;
  responder = () => ({ status: 200, corpo: "ja_lotado" });

  assert.equal(await loja.marcarGrupoLotado("loja-a", "grupo-1"), "ja_lotado");

  assert.deepEqual(pedidos, [
    { metodo: "POST", caminho: "/rest/v1/rpc/marcar_grupo_lotado", corpo: { p_tenant: "loja-a", p_group: "grupo-1" } },
  ]);
});

test("reabrir chama reabrir_grupo e repassa os quatro resultados do contrato", async () => {
  for (const resultado of ["ok", "nao_lotado", "ainda_cheio", "nao_encontrado"] as const) {
    pedidos.length = 0;
    responder = () => ({ status: 200, corpo: resultado });

    assert.equal(await loja.reabrirGrupo("loja-a", "grupo-2"), resultado);

    assert.deepEqual(pedidos, [
      { metodo: "POST", caminho: "/rest/v1/rpc/reabrir_grupo", corpo: { p_tenant: "loja-a", p_group: "grupo-2" } },
    ]);
  }
});

test("resultado fora do contrato é erro, nunca um 200 ou 404 por engano", async () => {
  responder = () => ({ status: 200, corpo: "talvez" });
  await assert.rejects(loja.marcarGrupoLotado("loja-a", "grupo-1"), /fora do contrato/);

  // Cada RPC tem a sua lista. Mutante: uma lista só para os dois.
  responder = () => ({ status: 200, corpo: "ainda_cheio" });
  await assert.rejects(loja.marcarGrupoLotado("loja-a", "grupo-1"), /fora do contrato/);
  responder = () => ({ status: 200, corpo: "ja_lotado" });
  await assert.rejects(loja.reabrirGrupo("loja-a", "grupo-1"), /fora do contrato/);
});

test("erro do banco sobe com a mensagem dele", async () => {
  // 400, não 503/520: o postgrest-js repete esses com espera de 1s, 2s, 4s.
  responder = () => ({ status: 400, corpo: { code: "42501", message: "permission denied for function reabrir_grupo" } });
  await assert.rejects(loja.reabrirGrupo("loja-a", "grupo-1"), /permission denied/);
});
