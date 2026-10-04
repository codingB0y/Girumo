import assert from "node:assert/strict";
import { test } from "node:test";
import { comPrazo, DEMOROU_DEMAIS } from "./checkout-client";

// Relógio falso (`t.mock.timers`): o prazo estoura quando o teste manda, não quando a
// máquina carregada deixa — com timer de verdade a suíte inteira deixava isto instável.
// O `timeout` de cada teste só existe para um mutante que nunca rejeita não travar a suíte.
const PRAZO = 20_000;

test("fetch pendurado: estoura no prazo com a mensagem em português e aborta o pedido", { timeout: 2000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let sinalVisto: AbortSignal | undefined;
  // Como o fetch: só sai do lugar quando abortado, e aí rejeita com AbortError.
  const pendurado = (sinal: AbortSignal) =>
    new Promise<string>((_, rejeitar) => {
      sinalVisto = sinal;
      sinal.addEventListener("abort", () => rejeitar(new DOMException("aborted", "AbortError")));
    });

  const pedido = comPrazo(pendurado, PRAZO);
  t.mock.timers.tick(PRAZO - 1);
  assert.equal(sinalVisto?.aborted, false);
  t.mock.timers.tick(1);

  await assert.rejects(pedido, { message: DEMOROU_DEMAIS });
  assert.equal(sinalVisto?.aborted, true);
});

test("espera que ignora o sinal (a leitura da sessão antes do fetch) também estoura", { timeout: 2000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pedido = comPrazo(() => new Promise<string>(() => {}), PRAZO);
  t.mock.timers.tick(PRAZO);

  await assert.rejects(pedido, { message: DEMOROU_DEMAIS });
});

test("resposta a tempo: devolve o valor e não aborta depois", { timeout: 2000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let sinalVisto: AbortSignal | undefined;
  const url = await comPrazo(async (sinal) => {
    sinalVisto = sinal;
    return "https://checkout.stripe.com/c/pay/x";
  }, PRAZO);

  assert.equal(url, "https://checkout.stripe.com/c/pay/x");
  t.mock.timers.tick(PRAZO * 3);
  assert.equal(sinalVisto?.aborted, false);
});

test("erro do servidor antes do prazo chega intacto, não vira 'demorou demais'", { timeout: 2000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await assert.rejects(
    comPrazo(async () => {
      throw new Error("Você já está no teste grátis.");
    }, PRAZO),
    { message: "Você já está no teste grátis." },
  );
});
