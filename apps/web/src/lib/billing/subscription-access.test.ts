import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  subscriptionAccess,
  subscriptionNotice,
} from "./subscription-access";

const AGORA = new Date("2026-08-26T12:00:00.000Z");

/** Fim de periodo daqui a N dias (negativo = ja passou). */
function emDias(dias: number): string {
  return new Date(AGORA.getTime() + dias * 86_400_000).toISOString();
}

test("assinatura paga concede o plano", () => {
  for (const status of ["active", "trialing", "free"]) {
    const r = subscriptionAccess({ status, stripeStatus: status, periodEnd: emDias(30) }, AGORA);
    assert.equal(r.grantsPlan, true, `${status} tinha de conceder`);
  }
});

test("boleto emitido concede o plano enquanto o Stripe nao expira", () => {
  // O nucleo desta mudanca. O cliente pagou (emitiu o boleto) e o dinheiro leva
  // 1 a 3 dias uteis. Ate 26/08 ele caia no FREE e batia numa parede depois de
  // ter comprado.
  const r = subscriptionAccess(
    { status: "unpaid", stripeStatus: "incomplete", periodEnd: emDias(28) },
    AGORA,
  );
  assert.equal(r.grantsPlan, true);
  assert.equal(r.state, "pending_payment");
});

test("cobranca que falhou de vez NAO concede, mesmo com o mesmo status no banco", () => {
  // `unpaid` no banco significa DUAS coisas: primeira cobranca pendente (veio de
  // `incomplete`) e "o Stripe desistiu de cobrar". So o `stripe_status` separa —
  // e tratar as duas igual foi exatamente o defeito.
  const r = subscriptionAccess(
    { status: "unpaid", stripeStatus: "unpaid", periodEnd: emDias(30) },
    AGORA,
  );
  assert.equal(r.grantsPlan, false);
  assert.equal(r.state, "payment_failed");
});

test("renovacao falhada e cancelamento nao concedem", () => {
  const pastDue = subscriptionAccess(
    { status: "past_due", stripeStatus: "past_due", periodEnd: emDias(30) },
    AGORA,
  );
  assert.equal(pastDue.grantsPlan, false);
  assert.equal(pastDue.state, "payment_failed");

  const cancelada = subscriptionAccess(
    { status: "canceled", stripeStatus: "canceled", periodEnd: emDias(30) },
    AGORA,
  );
  assert.equal(cancelada.grantsPlan, false);
  assert.equal(cancelada.state, "canceled");
});

test("pendencia com periodo ja vencido para de conceder", () => {
  // Teto de seguranca. Normalmente quem encerra e o proprio Stripe
  // (`incomplete_expired` -> `canceled`), mas se esse webhook se perder o acesso
  // ficaria aberto para sempre — de graca, sem ninguem notar.
  const r = subscriptionAccess(
    { status: "unpaid", stripeStatus: "incomplete", periodEnd: emDias(-1) },
    AGORA,
  );
  assert.equal(r.grantsPlan, false);
  assert.equal(r.state, "pending_expired");
});

test("sem stripe_status nao concede — linha antiga nao vira acesso de graca", () => {
  // Linhas gravadas antes de o webhook guardar `stripe_status` nao provam nada.
  // Em caminho de cobranca, o desconhecido tem de ser conservador.
  const r = subscriptionAccess(
    { status: "unpaid", stripeStatus: null, periodEnd: emDias(30) },
    AGORA,
  );
  assert.equal(r.grantsPlan, false);
});

test("sem assinatura nenhuma nao concede", () => {
  const r = subscriptionAccess({ status: null, stripeStatus: null, periodEnd: null }, AGORA);
  assert.equal(r.grantsPlan, false);
  assert.equal(r.state, "none");
});

test("o aviso de boleto nao manda regularizar nem escolher plano", () => {
  // Os dois textos errados que este card veio corrigir: "regularize pra nao
  // perder acesso" (nao ha o que regularizar) e "escolha um plano" (ele acabou
  // de escolher e pagar).
  const aviso = subscriptionNotice("pending_payment");
  assert.doesNotMatch(aviso, /regulariz/i);
  assert.doesNotMatch(aviso, /escolha um plano/i);
  assert.match(aviso, /confirma|compensa|aguard/i);
});

test("cobranca falhada continua pedindo regularizacao", () => {
  const aviso = subscriptionNotice("payment_failed");
  assert.match(aviso, /regulariz|atualiz|pagamento/i);
});

test("boleto pendente sem periodo definido NAO concede", () => {
  // Sem current_period_end nao ha ate quando liberar, e liberar "por
  // enquanto" vira acesso sem fim. Em cobranca, o desconhecido e conservador.
  const r = subscriptionAccess(
    { status: "unpaid", stripeStatus: "incomplete", periodEnd: null },
    AGORA,
  );
  assert.equal(r.grantsPlan, false);
  assert.equal(r.state, "pending_expired");
});

test("nao mede idade por updated_at — o banco tem trigger que o reescreve", () => {
  // O trigger set_updated_at_subscriptions poe now() em TODO update, entao updated_at
  // mede a ultima sincronizacao do webhook, nunca a idade da pendencia. Um teto
  // baseado nele reiniciaria a cada evento do Stripe e nunca fecharia.
  const fonte = readFileSync(
    path.join(process.cwd(), "src", "lib", "billing", "subscription-access.ts"),
    "utf8",
  );
  // Proibe o USO, nao a palavra: o comentario do modulo cita updated_at
  // justamente para explicar por que ele nao serve.
  assert.doesNotMatch(
    fonte,
    /input.updatedAt|updatedAt:/,
    "nao voltar a medir idade por updated_at",
  );
});
