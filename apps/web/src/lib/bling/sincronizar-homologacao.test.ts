import assert from "node:assert/strict";
import { test } from "node:test";

import { avisar, chamadasDoBling, criarBlingFalso, json, LOJA, pedidoDoBling, type BlingFalso } from "@/test/bling-falso";

import { sincronizarLoja } from "./sincronizar";

/**
 * O teste técnico da homologação pelo motor (gatilho "homologacao"): com a trava da loja e os tokens dela, e a
 * renovação do motor no 401 (o par novo vai para o banco, conferindo a versão). Só o teste: nada da fila, da
 * varredura, do histórico, das situações nem dos canais.
 */

const rodar = (f: BlingFalso) => sincronizarLoja(LOJA, "homologacao", 40_000, 55_000, f.deps);

/** A API de homologação no Bling falso; `invalidaNoPasso` recusa o token da loja uma vez naquele passo. */
function comHomologacao(f: BlingFalso, invalidaNoPasso?: number): void {
  let passo = 0;
  let invalidou = false;
  const resposta = (status: number, data?: unknown) =>
    data === undefined
      ? new Response(null, { status, headers: { "x-bling-homologacao": `h${passo}` } })
      : new Response(JSON.stringify({ data }), { status, headers: { "x-bling-homologacao": `h${passo}`, "content-type": "application/json" } });
  f.bling.forcadas.push({
    caminho: /^\/homologacao\/produtos/,
    vezes: Infinity,
    resposta: () => {
      if (passo === invalidaNoPasso && !invalidou) {
        invalidou = true;
        // O token que a loja usava morre no Bling, como na doc: só o par renovado serve daqui em diante.
        f.bling.aceitos = new Set();
        return json(401, { error: { type: "invalid_token" } });
      }
      const produto = { nome: "Copo do Bling", preco: 32.56, codigo: "COD-4587" };
      const r = [resposta(200, produto), resposta(201, { ...produto, id: 777 }), resposta(200), resposta(200), resposta(204)][passo];
      passo += 1;
      return r;
    },
  });
}

test("homologação: os 5 passos com o token da loja, sem tocar na fila, e o relatório no resultado", async () => {
  const f = criarBlingFalso();
  comHomologacao(f);
  f.bling.pedidos.set(8001, pedidoDoBling(8001));
  avisar(f, 8001);
  const r = await rodar(f);

  assert.equal(r.trava, true);
  assert.equal(r.homologacao?.ok, true, r.homologacao?.erro ?? "");
  assert.deepEqual(r.homologacao?.passos.map((p) => p.passo), ["GET", "POST", "PUT", "PATCH", "DELETE"]);
  // Só o teste: o pedido avisado fica na fila para a execução normal.
  assert.equal(r.processados, 0);
  assert.equal(f.pedidos.get(8001)?.pending, true);
  assert.equal(chamadasDoBling(f, "/situacoes/modulos").length + chamadasDoBling(f, "/canais-venda").length, 0);
  assert.ok(f.bling.chamadas.every((c) => c.caminho.startsWith("/homologacao/")));
});

test("homologação: o Bling invalida o token no meio — o motor renova, grava o par novo (versão +1) e o passo passa", async () => {
  const f = criarBlingFalso();
  const versao = f.conexao?.tokenVersion ?? 0;
  comHomologacao(f, 2);
  const r = await rodar(f);

  assert.equal(r.homologacao?.ok, true, r.homologacao?.erro ?? "");
  assert.equal(r.homologacao?.passos.find((p) => p.passo === "PUT")?.renovou, true);
  assert.equal(f.conexao?.tokenVersion, versao + 1);
  assert.equal(chamadasDoBling(f, "/oauth/token").length, 1);
});

test("homologação com a loja ocupada (outra execução tem a trava): não roda e diz que não pegou a trava", async () => {
  const f = criarBlingFalso();
  comHomologacao(f);
  f.trava = { dono: "outra-execucao", ate: f.agora + 60_000 };
  const r = await rodar(f);
  assert.equal(r.trava, false);
  assert.equal(r.homologacao, undefined);
  assert.equal(f.bling.chamadas.length, 0);
});

test("homologação com a renovação recusada pelo Bling: o relatório diz que falhou e o resultado traz a parada (reconectar)", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  t.mock.method(console, "error", () => undefined);
  const f = criarBlingFalso();
  comHomologacao(f, 1);
  f.bling.oauth = () => json(400, { error: "invalid_grant" });
  const r = await rodar(f);

  assert.equal(r.homologacao?.ok, false);
  assert.match(r.homologacao?.erro ?? "", /POST: a renovação do acesso falhou/);
  assert.equal(r.parou, "reconectar");
});
