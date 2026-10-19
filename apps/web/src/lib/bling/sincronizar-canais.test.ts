import assert from "node:assert/strict";
import { test } from "node:test";

import { AGORA, ajustarConexao, avisar, chamadasDoBling, criarBlingFalso, DIA, HORA, iso, LOJA, pedidoDoBling, VIDA, type BlingFalso } from "@/test/bling-falso";

import { sincronizarLoja } from "./sincronizar";

/**
 * Os canais de venda da conta no motor (`GET /canais-venda`): lidos quando nunca foram (conexão nova, reconexão) ou
 * depois de 24 h, como as situações. Sem o escopo no app do Bling, a loja segue sincronizando: a lista fica null (o
 * cartão cai nos ids vistos nos pedidos) e só a hora é gravada, para não perguntar de novo a cada execução.
 */

const YAMPI = { id: 200000001, nome: "Loja Yampi", tipo: "Yampi", ativo: true };
const leituras = (f: BlingFalso) => chamadasDoBling(f, "/canais-venda").length;
const rodar = (f: BlingFalso) => sincronizarLoja(LOJA, "aviso", 60_000, VIDA.aviso, f.deps);

test("canais nunca lidos: lê, grava com a hora e segue; lidos há menos de 24 h não relê", async () => {
  const f = criarBlingFalso();
  f.bling.canais = [YAMPI];
  ajustarConexao(f, { salesChannels: null, salesChannelsAt: null, metaEnabled: false });
  f.bling.pedidos.set(8001, pedidoDoBling(8001));
  avisar(f, 8001);
  const r = await rodar(f);

  assert.equal(leituras(f), 1);
  assert.deepEqual(f.conexao?.salesChannels, [YAMPI]);
  assert.equal(f.conexao?.salesChannelsAt, iso(AGORA));
  assert.equal(r.processados, 1, "a fila anda junto");

  await rodar(f);
  assert.equal(leituras(f), 1, "lidos agora: não relê");
});

test("canais lidos há mais de 24 h: relê (um canal novo na conta aparece)", async () => {
  const f = criarBlingFalso();
  f.bling.canais = [YAMPI, { id: 200000002, nome: "Shopee", tipo: "Shopee", ativo: false }];
  ajustarConexao(f, { salesChannels: [YAMPI], salesChannelsAt: iso(AGORA - DIA - HORA) });
  await rodar(f);
  assert.equal(leituras(f), 1);
  assert.equal(f.conexao?.salesChannels?.length, 2);
});

test("app sem o escopo (403 do Bling): a lista fica null com a hora, sem erro nem parada; a fila anda", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const f = criarBlingFalso();
  f.bling.canais = null;
  ajustarConexao(f, { salesChannels: [YAMPI], salesChannelsAt: null, metaEnabled: false });
  f.bling.pedidos.set(8001, pedidoDoBling(8001));
  avisar(f, 8001);
  const r = await rodar(f);

  // Mutante (deixar o 403 subir): `escopo` para a rodada inteira e grava "sem permissão para ler pedidos".
  assert.deepEqual([r.processados, r.falhas, r.parou], [1, 0, undefined]);
  assert.deepEqual([f.conexao?.salesChannels, f.conexao?.salesChannelsAt, f.conexao?.lastError], [null, iso(AGORA), null]);
});

test("Bling fora do ar na leitura dos canais: fica a lista que havia, sem a hora (tenta na próxima), e a fila anda", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const f = criarBlingFalso();
  f.bling.forcadas.push({ caminho: /^\/canais-venda$/, vezes: Infinity, resposta: () => new Response("", { status: 503 }) });
  ajustarConexao(f, { salesChannels: [YAMPI], salesChannelsAt: iso(AGORA - 2 * DIA), metaEnabled: false });
  f.bling.pedidos.set(8001, pedidoDoBling(8001));
  avisar(f, 8001);
  const r = await rodar(f);

  assert.equal(r.processados, 1);
  assert.deepEqual([f.conexao?.salesChannels, f.conexao?.salesChannelsAt], [[YAMPI], iso(AGORA - 2 * DIA)]);
});
