import assert from "node:assert/strict";
import { test } from "node:test";
import { estadoDoPlano } from "./plano-estado";

const AGORA = new Date("2026-10-06T12:00:00.000Z");
/** 12:00 de Brasília em 10/10. */
const FIM = "2026-10-10T15:00:00.000Z";

test("sem assinatura carregada, nada a dizer", () => {
  assert.equal(estadoDoPlano(null, AGORA), null);
});

test("teste em andamento: concede o plano e diz até quando", () => {
  assert.deepEqual(estadoDoPlano({ status: "trialing", current_period_end: FIM }, AGORA), {
    grantsPlan: true,
    state: "trial",
    recado: "Teste grátis até 10/10. Depois a assinatura segue sozinha.",
  });
});

test("teste cancelado no portal: concede até o fim e avisa que não cobra", () => {
  const plano = estadoDoPlano(
    { status: "trialing", current_period_end: FIM, cancel_at_period_end: true },
    AGORA,
  );
  assert.deepEqual(plano, {
    grantsPlan: true,
    state: "trial_canceled",
    recado: "Teste cancelado — termina em 10/10 sem cobrança.",
  });
  assert.doesNotMatch(plano?.recado ?? "", /1ª cobrança|segue sozinha/);
});

test("boleto emitido: o status cru do Stripe e o fim do período chegam à decisão", () => {
  const linha = { status: "unpaid", metadata: { stripe_status: "incomplete" }, current_period_end: FIM };
  assert.equal(estadoDoPlano(linha, AGORA)?.state, "pending_payment");
});

test("cartão repetido: o motivo do cancelamento chega à decisão", () => {
  const linha = { status: "canceled", metadata: { cancel_reason: "trial_card_reused" } };
  assert.equal(estadoDoPlano(linha, AGORA)?.state, "trial_card_reused");
});
