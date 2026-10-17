import { test } from "node:test";
import assert from "node:assert/strict";
import { podeEnviar, temPlano } from "./cron-recipients";

const AGORA = new Date("2026-10-16T12:00:00.000Z");
const FUTURO = "2026-11-16T12:00:00.000Z";

test("só loja com plano valendo recebe os avisos recorrentes", () => {
  const linhas = {
    ativa: { status: "active", metadata: {}, current_period_end: FUTURO },
    teste: { status: "trialing", metadata: {}, current_period_end: FUTURO },
    manual: { status: "active", metadata: { manual_grant: true }, current_period_end: null },
    boleto: { status: "unpaid", metadata: { stripe_status: "incomplete" }, current_period_end: FUTURO },
    cancelada: { status: "canceled", metadata: {}, current_period_end: FUTURO },
    inadimplente: { status: "past_due", metadata: {}, current_period_end: FUTURO },
    "sem-status": { status: null, metadata: null, current_period_end: null },
  };
  const comPlano = Object.entries(linhas)
    .filter(([, linha]) => temPlano(linha, AGORA))
    .map(([loja]) => loja);
  assert.deepEqual(comPlano, ["ativa", "teste", "manual", "boleto"]);
});

test("loja sem linha em subscriptions fica de fora", () => {
  assert.equal(temPlano(null, AGORA), false);
});

test("dedupe vazio libera o envio", () => {
  assert.equal(podeEnviar({ data: [], error: null }), true);
});

test("dedupe que achou registro não reenvia", () => {
  assert.equal(podeEnviar({ data: [{ id: "n1" }], error: null }), false);
});

test("erro no dedupe não envia — era o caso que reenviava de hora em hora", () => {
  // `maybeSingle` com duas linhas devolve data null + PGRST116: o código lia só
  // `data`, achava "nada enviado" e mandava de novo, gravando mais uma linha.
  assert.equal(podeEnviar({ data: null, error: { code: "PGRST116" } }), false);
  assert.equal(podeEnviar({ data: null, error: { message: "timeout" } }), false);
});

test("leitura sem dado nem erro não envia", () => {
  assert.equal(podeEnviar({ data: null, error: null }), false);
});
