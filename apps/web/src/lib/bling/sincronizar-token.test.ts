import assert from "node:assert/strict";
import { test } from "node:test";

import { abrir, impressaoDaChave, selar } from "@/lib/security/secret-box";
import { contextoDoToken } from "@/lib/stores/bling-conexoes";
import {
  AGORA,
  ajustarConexao,
  avisar,
  capturarLogs,
  chamadasDoBling,
  CHAVE,
  criarBlingFalso,
  HORA,
  iso,
  json,
  linhaPendente,
  LOJA,
  MINUTO,
  pedidoDoBling,
  semLog,
  VIDA,
  type BlingFalso,
} from "@/test/bling-falso";

import { sincronizarLoja } from "./sincronizar";

/**
 * O par de tokens no motor (spec §3 "Token"): renovação, recusa relida antes de reconectar, par novo
 * que o banco não grava, releitura antes de renovar, chave de cifra trocada e 401 depois de renovar.
 * O limite global, o recuo depois de uma falha e o orçamento da renovação estão em
 * `sincronizar-token-recuo.test.ts`; os outros erros, em `sincronizar-erros.test.ts`.
 */

function rodar(f: BlingFalso) {
  return sincronizarLoja(LOJA, "cron", 60_000, VIDA.cron, f.deps);
}

function comPedidos(f: BlingFalso, ...ids: number[]): void {
  for (const id of ids) {
    f.bling.pedidos.set(id, pedidoDoBling(id));
    f.pedidos.set(id, linhaPendente(id));
  }
}

function tokenGuardado(f: BlingFalso, campo: "access" | "refresh"): string {
  const selado = campo === "access" ? f.conexao?.accessTokenEnc : f.conexao?.refreshTokenEnc;
  return abrir(selado ?? "", contextoDoToken(LOJA, campo), CHAVE);
}

const naApi = (f: BlingFalso) => f.bling.chamadas.filter((c) => c.caminho !== "/oauth/token");
const trocasDeToken = (f: BlingFalso) => chamadasDoBling(f, "/oauth/token").length;
const linha = (f: BlingFalso, id: number) => f.pedidos.get(id);

/**
 * O banco recusa gravar o par renovado (503): as primeiras `cai` tentativas, ou enquanto `cai(agora)`.
 * Devolve o instante de cada tentativa.
 */
function falharGravacaoDoToken(f: BlingFalso, cai: number | ((agora: number) => boolean)): number[] {
  const salvar = f.deps.conexoes.salvarTokensRenovados;
  const momentos: number[] = [];
  f.deps.conexoes.salvarTokensRenovados = async (...args) => {
    momentos.push(f.agora);
    if (typeof cai === "number" ? momentos.length <= cai : cai(f.agora)) throw new Error("supabase 503 (blip)");
    return salvar(...args);
  };
  return momentos;
}

/** Outro processo (reconexão) grava um par novo no banco: o velho deixa de valer no Bling. */
function trocarOPar(f: BlingFalso, nome: string): void {
  ajustarConexao(f, {
    tokenVersion: (f.conexao?.tokenVersion ?? 0) + 1,
    accessTokenEnc: selar(`access-${nome}`, contextoDoToken(LOJA, "access"), CHAVE),
    refreshTokenEnc: selar(`refresh-${nome}`, contextoDoToken(LOJA, "refresh"), CHAVE),
    accessExpiresAt: iso(f.agora + 6 * HORA),
  });
  f.bling.aceitos = new Set([`access-${nome}`]);
  f.bling.refreshValido = `refresh-${nome}`;
}

test("token vencendo em menos de 30 min: renova antes, grava o par novo cifrado com a versão + 1 e usa o novo", async () => {
  const f = criarBlingFalso();
  // Conexão de antes da impressão da chave: a renovação passa a gravá-la.
  ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO), keyFp: null });
  comPedidos(f, 1001);
  const r = await rodar(f);

  assert.equal(trocasDeToken(f), 1);
  assert.equal(f.conexao?.tokenVersion, 4);
  assert.equal(f.conexao?.keyFp, impressaoDaChave(CHAVE));
  assert.deepEqual([tokenGuardado(f, "access"), tokenGuardado(f, "refresh")], ["access-novo-1", "refresh-novo-1"]);
  assert.equal(f.conexao?.accessExpiresAt, iso(AGORA + 6 * HORA));
  assert.ok(!JSON.stringify(f.conexao).includes("access-novo-1"), "o banco só vê o token cifrado");
  assert.ok(naApi(f).length > 0 && naApi(f).every((c) => c.token === "access-novo-1"));
  assert.equal(r.processados, 1);
});

test("refresh recusado e ninguém trocou o par: relê depois de 2 s e de mais 5 s, e só então reconectar e e-mail uma vez", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  f.bling.refreshValido = "outro-refresh";
  comPedidos(f, 1001);
  const restaurar = semLog();
  const r = await rodar(f).finally(restaurar);

  assert.equal(r.parou, "reconectar");
  assert.equal(f.agora, AGORA + 7_000, "as duas releituras esperaram 2 s e 5 s");
  assert.deepEqual([f.conexao?.status, f.conexao?.lastError], ["reconectar", "O Bling recusou a renovação do acesso."]);
  assert.equal(f.emails.length, 1);
  assert.equal(f.emails[0].kind, "bling_reconectar");
  assert.ok(f.emails[0].html.includes("https://app.girumo.test/painel/configuracoes?secao=integracoes"));
  assert.deepEqual([linha(f, 1001)?.pending, linha(f, 1001)?.attempts], [true, 0]);
  assert.equal(f.trava, null);

  const deNovo = await rodar(f);
  assert.equal(deNovo.trava, false);
  assert.equal(f.emails.length, 1);
});

test("refresh recusado porque uma reconexão trocou o par no meio: adota o do banco e segue", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  f.bling.oauth = () => {
    trocarOPar(f, "reconectado");
    return json(400, { error: "invalid_grant" });
  };
  comPedidos(f, 1001);
  const r = await rodar(f);

  assert.deepEqual([r.parou, r.processados, f.conexao?.status, f.emails.length], [undefined, 1, "ativa", 0]);
  assert.ok(naApi(f).length > 0 && naApi(f).every((c) => c.token === "access-reconectado"));
});

test("refresh recusado enquanto outro processo grava o par que acabou de rotacionar: relê em 2 s e 5 s e adota", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  f.bling.oauth = () => json(400, { error: "invalid_grant" });
  f.gancho = (entrada) => {
    // O par do outro processo chega ao banco 3 s depois da recusa: a leitura de 2 s ainda não vê, a de 7 s vê.
    if (entrada === "conexoes.lerConexao" && f.agora >= AGORA + 3_000 && f.conexao?.tokenVersion === 3) trocarOPar(f, "do-outro");
  };
  comPedidos(f, 1001);
  const r = await rodar(f);

  // Mutante: uma releitura só marcava a loja para reconectar e mandava e-mail com o par bom a caminho.
  assert.deepEqual([r.parou, r.processados, f.conexao?.status, f.emails.length], [undefined, 1, "ativa", 0]);
  assert.ok(naApi(f).length > 0 && naApi(f).every((c) => c.token === "access-do-outro"));
});

test("par novo que o banco não grava de primeira: tenta de novo em 0,5 s e 2 s, grava, e a próxima execução renova sem reconectar", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  comPedidos(f, 1001);
  const momentos = falharGravacaoDoToken(f, 2);
  const restaurar = semLog();
  const r1 = await rodar(f).finally(restaurar);

  // A prova do revisor: duas falhas seguidas abortavam com o único par válido só na memória; a
  // execução seguinte renovava com o refresh já morto → reconectar e e-mail.
  assert.deepEqual([r1.parou, r1.processados], [undefined, 1]);
  assert.deepEqual(momentos.map((m) => m - AGORA), [0, 500, 2_500]);
  assert.deepEqual([f.conexao?.tokenVersion, tokenGuardado(f, "refresh")], [4, "refresh-novo-1"]);

  f.agora += MINUTO;
  ajustarConexao(f, { accessExpiresAt: iso(f.agora + 10 * MINUTO) });
  const r2 = await rodar(f);
  assert.deepEqual([r2.parou, f.conexao?.status, f.emails.length, trocasDeToken(f)], [undefined, "ativa", 0, 2]);
});

test("par novo que não grava nem nas 4 tentativas: segue com ele em memória, grava no lote seguinte e nunca volta ao velho", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  comPedidos(f, ...Array.from({ length: 25 }, (_, i) => 6000 + i));
  // 4 tentativas na renovação (0,5 s, 2 s e 5 s entre elas) + a do lote 1; a do lote 2 grava.
  const momentos = falharGravacaoDoToken(f, 5);
  const restaurar = semLog();
  const r = await rodar(f).finally(restaurar);

  assert.deepEqual([r.parou, r.processados], [undefined, 25]);
  assert.deepEqual(momentos.slice(0, 4).map((m) => m - AGORA), [0, 500, 2_500, 7_500]);
  assert.equal(momentos.length, 6);
  // Mutante: o lote 1 trocava pelo par do banco porque a versão diferia — o par velho, já morto no Bling.
  assert.ok(naApi(f).length > 0 && naApi(f).every((c) => c.token === "access-novo-1"));
  assert.deepEqual([f.conexao?.tokenVersion, tokenGuardado(f, "refresh"), trocasDeToken(f)], [4, "refresh-novo-1", 1]);
});

test("rodada que acaba sem outro lote com o par novo pendente: grava antes de soltar a trava", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  comPedidos(f, 1001);
  // As 4 tentativas da renovação falham e gastam 7,5 s de 12: a fila nem começa (orçamento).
  falharGravacaoDoToken(f, 4);
  const restaurar = semLog();
  const r = await sincronizarLoja(LOJA, "aviso", 12_000, VIDA.aviso, f.deps).finally(restaurar);

  assert.equal(r.parou, "orcamento");
  // Mutante: soltar sem gravar deixava no banco o refresh morto, e a próxima execução o usaria.
  assert.deepEqual([f.conexao?.tokenVersion, tokenGuardado(f, "refresh")], [4, "refresh-novo-1"]);
});

test("par novo que não grava até o fim: o log avisa a loja que vai precisar reconectar, sem token nenhum", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  comPedidos(f, 1001);
  falharGravacaoDoToken(f, Number.POSITIVE_INFINITY);
  f.bling.pedidos.set(1002, pedidoDoBling(1002));
  // Um aviso chega enquanto a trava é solta: pendente vencido e tempo de sobra pediriam outra rodada.
  f.gancho = (entrada) => {
    if (entrada === "conexoes.soltarTrava" && !f.pedidos.has(1002)) avisar(f, 1002);
  };
  const logs = capturarLogs();
  const r = await rodar(f).finally(logs.restaurar);

  assert.deepEqual([r.processados, f.conexao?.tokenVersion], [1, 3]);
  assert.ok(logs.linhas.some((l) => /loja loja-1: .*não foi gravado/.test(l)), logs.linhas.join("\n"));
  assert.ok(!logs.linhas.some((l) => /access-novo|refresh-novo|access-1|refresh-1/.test(l)), "nenhum token no log");
  // Mutante: outra rodada abria o par velho do banco, renovava com o refresh morto e pedia reconexão.
  assert.equal(f.trilha.filter((t) => t.startsWith("conexoes.soltarTrava")).length, 1, "sem outra rodada com o par velho");
  assert.deepEqual([f.conexao?.status, f.emails.length, trocasDeToken(f)], ["ativa", 0, 1]);
});

test("par novo que o banco recusa por 5 s perto do fim do orçamento: as novas tentativas vão até o fim da trava, não o do orçamento", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessExpiresAt: iso(AGORA + 10 * MINUTO) });
  comPedidos(f, 1001);
  const momentos = falharGravacaoDoToken(f, (agora) => agora < AGORA + 5_000);
  const restaurar = semLog();
  await sincronizarLoja(LOJA, "aviso", 7_000, VIDA.aviso, f.deps).finally(restaurar);

  // Mutante: com o fim do orçamento (7 s) como teto, a 4ª tentativa (em 7,5 s) não saía, a de soltar
  // a trava caía no mesmo blip, e o único par válido morria na memória (a loja ia para reconectar).
  assert.deepEqual(momentos.map((m) => m - AGORA), [0, 500, 2_500, 7_500]);
  assert.deepEqual([f.conexao?.tokenVersion, tokenGuardado(f, "refresh")], [4, "refresh-novo-1"]);
});

test("antes de renovar relê a conexão: o par de uma reconexão no meio do lote é adotado sem chamar /oauth/token", async () => {
  const f = criarBlingFalso();
  comPedidos(f, 1001, 1002);
  f.gancho = (entrada) => {
    // A dona reconectou enquanto o lote rodava: o access em mãos deixa de valer.
    if (entrada === "pedidos.salvarProcessado 1001 true") trocarOPar(f, "reconectado");
  };
  const r = await rodar(f);

  assert.deepEqual([r.processados, r.parou, r.falhas], [2, undefined, 0]);
  // Mutante: renovar com o refresh daqui gastava o balde global — e, se ele ainda valesse, mataria o par da reconexão.
  assert.equal(trocasDeToken(f), 0);
  assert.deepEqual(chamadasDoBling(f, "/pedidos/vendas/1002").map((c) => c.token), ["access-1", "access-reconectado"]);
});

test("acesso salvo que não abre com a chave de sempre (cifra adulterada ou de outra loja): reconectar sem chamar o Bling", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { accessTokenEnc: selar("access-1", contextoDoToken("outra-loja", "access"), CHAVE) });
  comPedidos(f, 1001);
  const r = await rodar(f);

  assert.equal(r.parou, "reconectar");
  assert.equal(f.conexao?.lastError, "Não foi possível ler o acesso salvo do Bling.");
  assert.equal(f.bling.chamadas.length, 0);
});

test("chave de cifra trocada (impressão diferente da gravada): para com o aviso da Girumo, sem reconectar nem e-mail", async () => {
  const f = criarBlingFalso();
  f.chave = Buffer.alloc(32, 8);
  comPedidos(f, 1001);
  const logs = capturarLogs();
  const r = await rodar(f).finally(logs.restaurar);

  // Mutante: tratar como token estragado mandava TODAS as lojas reconectar (e um e-mail para cada dona).
  assert.equal(r.parou, "chave");
  assert.deepEqual([f.conexao?.status, f.emails.length, f.bling.chamadas.length], ["ativa", 0, 0]);
  assert.match(f.conexao?.lastError ?? "", /Girumo/);
  assert.equal(f.conexao?.lastErrorAt, iso(f.agora));
  assert.ok(logs.linhas.some((l) => l.includes("loja loja-1") && /chave/.test(l)), logs.linhas.join("\n"));
  assert.deepEqual([linha(f, 1001)?.pending, linha(f, 1001)?.attempts], [true, 0]);
});

test("acesso que não abre e sem impressão gravada (conexão antiga): reconectar, como antes", async () => {
  const f = criarBlingFalso();
  ajustarConexao(f, { keyFp: null });
  f.chave = Buffer.alloc(32, 8);
  comPedidos(f, 1001);
  const r = await rodar(f);

  assert.deepEqual([r.parou, f.conexao?.status], ["reconectar", "reconectar"]);
});

test("Bling recusa o token mesmo depois de renovar: transitório, sem reconectar nem e-mail, e uma renovação forçada por execução", async () => {
  const f = criarBlingFalso();
  f.bling.recusaTudo = true;
  comPedidos(f, 1001, 1002);
  const restaurar = semLog();
  const r = await rodar(f).finally(restaurar);

  // A renovação deu certo: a concessão está viva, e o 401 seguinte é incidente do Bling ou de proxy.
  assert.deepEqual([r.parou, r.falhas], [undefined, 2]);
  assert.deepEqual([f.conexao?.status, f.emails.length], ["ativa", 0]);
  // O 401 do 2º pedido não renova de novo: cada pedido gastaria uma do balde global de 10/min.
  assert.equal(trocasDeToken(f), 1);
  assert.deepEqual([linha(f, 1001)?.attempts, linha(f, 1002)?.attempts], [1, 1]);
});

test("segundo 401 com a renovação forçada já gasta: relê a conexão e adota o par de uma reconexão no meio do lote", async () => {
  const f = criarBlingFalso();
  comPedidos(f, ...Array.from({ length: 10 }, (_, i) => 7001 + i));
  // 1º GET: 401 de passagem → a renovação forçada da execução acontece (e dá certo).
  f.bling.forcadas.push({ caminho: /^\/pedidos\/vendas\/7001$/, vezes: 1, resposta: () => json(401, { error: { type: "invalid_token" } }) });
  f.gancho = (entrada) => {
    // A dona reconecta enquanto o lote roda: par novo no banco; o access em mãos deixa de valer.
    if (entrada === "pedidos.salvarProcessado 7002 true") trocarOPar(f, "reconectado");
  };
  const r = await rodar(f);

  // A prova do revisor (R1-3): o 401 virava transitório pedido a pedido, o disjuntor abria e a loja
  // recém-reconectada ficava pausada 15 min com o par bom no banco.
  assert.deepEqual([r.parou, r.processados, r.falhas, f.conexao?.pausedUntil], [undefined, 10, 0, null]);
  assert.equal(trocasDeToken(f), 1, "o par da reconexão vem do banco, sem outro /oauth/token");
  const depois = f.bling.chamadas.filter((c) => /^\/pedidos\/vendas\/70(0[4-9]|10)$/.test(c.caminho)).map((c) => c.token);
  assert.ok(depois.length > 0 && depois.every((t) => t === "access-reconectado"), depois.join(","));
});

test("401 seguidos depois de renovar entram no disjuntor e a pausa explica no cartão", async () => {
  const f = criarBlingFalso();
  f.bling.recusaTudo = true;
  comPedidos(f, 7001, 7002, 7003, 7004, 7005, 7006);
  const restaurar = semLog();
  const r = await rodar(f).finally(restaurar);

  assert.deepEqual([r.parou, f.conexao?.status, f.emails.length], ["pausa", "ativa", 0]);
  assert.match(f.conexao?.lastError ?? "", /401|recusou/);
});
