import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { checkRateLimit } from "@/lib/security/rate-limit";
import { abrir } from "@/lib/security/secret-box";
import { contextoDoToken } from "@/lib/stores/bling-conexoes";
import {
  bling,
  CHAVE,
  conexaoGravada,
  conexoes,
  destino,
  emitidos,
  GET,
  iniciar,
  montarRetorno,
  retorno,
  revogados,
  tarefasDepois,
  travasPedidas,
  trocas,
} from "@/test/bling-retorno-falso";

/**
 * O retorno do OAuth do Bling de ponta a ponta, no mundo falso de `src/test/bling-retorno-falso.ts`: a
 * troca do code e a gravação — retorno lento, conta de outra loja, Bling ou banco recusando, reconexão e o
 * orçamento global de /oauth/token. O caminho feliz e a sessão estão em `route.test.ts`.
 */

let gravacaoFalha = false;
let trocaRecusada = false;
let empresaRecusada = false;
/** O relógio do `Date.now` (quando o teste o controla) e quanto ele anda na consulta da empresa. */
let relogio = 0;
let demoraDaEmpresa = 0;
montarRetorno({
  gravacaoFalha: () => gravacaoFalha,
  trocaRecusada: () => trocaRecusada,
  empresaRecusada: () => empresaRecusada,
  naEmpresa: () => {
    relogio += demoraDaEmpresa;
  },
});
beforeEach(() => {
  gravacaoFalha = false;
  trocaRecusada = false;
  empresaRecusada = false;
  demoraDaEmpresa = 0;
});

test("retorno lento: o cliente do Bling para em 60 s; a 1ª sincronização leva 300 s − o gasto − 45 s, e com menos de 30 s nem começa", async (t) => {
  relogio = Date.now();
  t.mock.method(Date, "now", () => relogio);
  t.mock.method(console, "warn", () => undefined);
  for (const demora of [61_000, 230_000]) {
    demoraDaEmpresa = demora;
    const { state, cookie } = await iniciar();
    assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "conectado");
    await (tarefasDepois.at(-1) as () => Promise<unknown>)();
  }
  const gravada = conexoes.get("loja-b");
  assert.ok(gravada);
  // Passado o prazo, as situações nem são pedidas: lista vazia e sem hora (o motor recarrega), nunca o padrão.
  assert.deepEqual([gravada.situations, gravada.situations_at, "sale_situation_ids" in gravada], [[], null, false]);
  assert.ok(!bling.some((c) => c.url.includes("/situacoes/")));
  // 300 − 61 − 45 = 194 s, e a trava pede 30 s a mais; 300 − 230 − 45 = 25 s: o cron pega a loja.
  assert.deepEqual(travasPedidas(), [224]);
});

// Nenhum caminho do retorno revoga: o Bling pode tratar a autorização por empresa, e revogar
// derrubaria a de outra loja que já usa a conta. Token sem uso é só descartado.
test("conta do Bling já ligada a outra loja: outra_loja, sem revogar nada e sem gravar", async () => {
  conexoes.set("loja-a", conexaoGravada("loja-a", { status: "ativa" }));
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "outra_loja");
  assert.equal(trocas().length, 1);
  assert.deepEqual(revogados(), []);
  assert.equal(conexoes.has("loja-b"), false);
  assert.equal(conexoes.get("loja-a")?.token_version, 7);
  assert.equal(tarefasDepois.length, 0);
});

test("o Bling recusa a troca do code: erro e nada gravado", async () => {
  trocaRecusada = true;
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "erro");
  assert.equal(conexoes.size, 0);
  assert.deepEqual(revogados(), []);
});

test("os dados da empresa não vêm: erro, sem revogar e sem gravar", async () => {
  empresaRecusada = true;
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "erro");
  assert.equal(trocas().length, 1);
  assert.deepEqual(revogados(), []);
  assert.equal(conexoes.size, 0);
});

test("o banco cai na gravação: erro, sem revogar, e o token não vai para log", async () => {
  gravacaoFalha = true;
  const erros: string[] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => { erros.push(args.map(String).join(" ")); };
  try {
    const { state, cookie } = await iniciar();
    assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "erro");
  } finally {
    console.error = consoleError;
  }
  assert.equal(trocas().length, 1);
  assert.deepEqual(revogados(), []);
  assert.ok(erros.some((linha) => linha.includes("banco fora do ar")));
  assert.ok(!erros.some((linha) => linha.includes(emitidos.access) || linha.includes(emitidos.refresh)));
  assert.equal(tarefasDepois.length, 0, "sem conexão gravada não há o que sincronizar");
});

test("reconexão da mesma loja: tokens novos, versão + 1, falhas zeradas e ajustes mantidos", async () => {
  conexoes.set("loja-b", conexaoGravada("loja-b"));
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "conectado");
  const gravada = conexoes.get("loja-b");
  assert.ok(gravada);
  assert.deepEqual(
    [gravada.status, gravada.token_version, gravada.consecutive_failures, gravada.reconnect_alerted_at, gravada.last_error],
    ["ativa", 8, 0, null, null],
  );
  assert.deepEqual([gravada.high_value, gravada.meta_enabled, gravada.sale_situation_ids, gravada.backfill_page], [500, false, [9], 9]);
  assert.equal(abrir(String(gravada.refresh_token_enc), contextoDoToken("loja-b", "refresh"), CHAVE), emitidos.refresh);
  assert.deepEqual(revogados(), []);
  assert.equal(tarefasDepois.length, 1);
});

// Último de propósito: o balde em memória do limite fica cheio até o fim do arquivo.
test("orçamento global de /oauth/token esgotado: erro sem chamar o Bling", async () => {
  for (let i = 0; i < 10; i += 1) await checkRateLimit("bling:oauth-token", 10, 60_000);
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "erro");
  assert.equal(trocas().length, 0);
});
