import assert from "node:assert/strict";
import { test } from "node:test";

import { MATRIZ_PADRAO, type RastreioConfig } from "@/lib/rastreio/tipos";

import { emailDoProblemaParaLoja, type DepsDoAlertaDaLoja } from "./avisar-loja-por-email";

type Enviado = Parameters<DepsDoAlertaDaLoja["enviar"]>[0];

const CONFIG: RastreioConfig = {
  tenantId: "t-1", publicSlug: "loja-exemplo", matrix: MATRIZ_PADRAO, notifyStoreOnProblem: true,
  vipLinkId: null, storeWhatsapp: null, importedAt: null, sweepCursor: null,
};
const PEDIDO = { id: "p-1", numero: "1541" };

function montar(extra: Partial<DepsDoAlertaDaLoja> = {}) {
  const enviados: Enviado[] = [];
  const deps: DepsDoAlertaDaLoja = {
    donos: async () => [
      { email: "ana@loja.test", nome: "Ana Paula" },
      { email: "beto@loja.test", nome: "Beto" },
    ],
    enviar: async (o) => { enviados.push(o); return true; },
    appUrl: () => "https://app.girumo.test",
    config: async () => CONFIG,
    ...extra,
  };
  return { deps, enviados };
}

/** As linhas de log (warn e error) guardadas em vez de impressas. */
async function comLog(f: () => Promise<void>): Promise<string[]> {
  const [erro, aviso] = [console.error, console.warn];
  const linhas: string[] = [];
  console.error = (...args: unknown[]) => void linhas.push(args.map(String).join(" "));
  console.warn = console.error;
  try {
    await f();
  } finally {
    [console.error, console.warn] = [erro, aviso];
  }
  return linhas;
}

test("um e-mail por dono, com o assunto do pedido e o botão para Entregas", async () => {
  const { deps, enviados } = montar();
  await emailDoProblemaParaLoja("t-1", PEDIDO, deps);
  assert.deepEqual(enviados.map((e) => e.to), ["ana@loja.test", "beto@loja.test"]);
  for (const e of enviados) {
    assert.deepEqual([e.kind, e.tenantId, e.subject], ["rastreio_problema", "t-1", "Pedido nº 1541: a entrega não foi concluída"]);
    assert.ok(e.html.includes('href="https://app.girumo.test/painel/vendas/entregas?pedido=p-1"'));
    assert.equal(e.idempotencyKey, undefined);
  }
  assert.match(enviados[0].html, /Oi Ana!/);
});

test("sem dono, não envia e não lança", async () => {
  const { deps, enviados } = montar({ donos: async () => [] });
  await emailDoProblemaParaLoja("t-1", PEDIDO, deps);
  assert.deepEqual(enviados, []);
});

test("um dono que falha não impede o outro; o log não leva o endereço", async () => {
  const enviados: Enviado[] = [];
  const { deps } = montar({
    enviar: async (o) => {
      if (o.to === "ana@loja.test") throw new Error("resend fora do ar");
      enviados.push(o);
      return true;
    },
  });
  const log = await comLog(() => emailDoProblemaParaLoja("t-1", PEDIDO, deps));
  assert.deepEqual(enviados.map((e) => e.to), ["beto@loja.test"]);
  assert.equal(log.length, 1);
  assert.ok(log[0].includes("t-1") && !log[0].includes("ana@loja.test"));
});

test("com o aviso por e-mail desligado (ou sem config), nenhum envio", async () => {
  for (const config of [async () => ({ ...CONFIG, notifyStoreOnProblem: false }), async () => null]) {
    let lidos = 0;
    const { deps, enviados } = montar({ config, donos: async () => { lidos++; return []; } });
    await emailDoProblemaParaLoja("t-1", PEDIDO, deps);
    assert.deepEqual([enviados, lidos], [[], 0]);
  }
});

test("config ou donos que explodem: nada sai e não lança", async () => {
  for (const extra of [
    { config: async () => { throw new Error("banco fora do ar"); } },
    { donos: async () => { throw new Error("Auth: fora do ar"); } },
  ] satisfies Partial<DepsDoAlertaDaLoja>[]) {
    const { deps, enviados } = montar(extra);
    const log = await comLog(() => emailDoProblemaParaLoja("t-1", PEDIDO, deps));
    assert.deepEqual(enviados, []);
    assert.equal(log.length, 1);
  }
});

test("o id do pedido entra codificado no link", async () => {
  const { deps, enviados } = montar({ donos: async () => [{ email: "ana@loja.test", nome: "Ana" }] });
  await emailDoProblemaParaLoja("t-1", { id: "p 1&x=<y>", numero: "1541" }, deps);
  assert.ok(enviados[0].html.includes("pedido=p%201%26x%3D%3Cy%3E"));
});
