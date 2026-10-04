import { strict as assert } from "node:assert";
import { test } from "node:test";

import { trialEndingEmail } from "./templates";
import { trialEndingCopy } from "./trial-ending-copy";

const BASE = {
  planName: "Growth",
  amountCents: 29700,
  chargeAt: "2026-10-10T15:00:00.000Z",
  cardLast4: "4242",
};

test("assunto, valor, data e final do cartao", () => {
  const c = trialEndingCopy(BASE);
  assert.equal(c.subject, "Seu teste grátis termina em 3 dias");
  assert.equal(c.titulo, "Seu teste do Growth termina em 10/10");
  assert.equal(
    c.cobranca,
    "Nesse dia cobramos R$ 297 no cartão final 4242 e a assinatura continua sozinha, sem você precisar fazer nada.",
  );
  assert.equal(c.botao, "Continuar no Growth");
  assert.equal(c.cancelarAte, "09/10");
});

test("sem o final do cartao, a frase nao inventa numero", () => {
  const c = trialEndingCopy({ ...BASE, cardLast4: null });
  assert.equal(
    c.cobranca,
    "Nesse dia cobramos R$ 297 no cartão cadastrado e a assinatura continua sozinha, sem você precisar fazer nada.",
  );
});

test("o e-mail nao fala em reembolso (decisao 03/10/2026: so nos Termos)", () => {
  assert.doesNotMatch(JSON.stringify(trialEndingCopy(BASE)), /reembols|devolv|desist|arrepend/i);
});

test("o nome do plano vem do banco e sai escapado no HTML", () => {
  const { html } = trialEndingEmail({ ...BASE, planName: 'Growth <b>&"x"', appUrl: "https://app.example" });
  assert.match(html, /Growth &lt;b&gt;&amp;&quot;x&quot;/);
  assert.doesNotMatch(html, /<b>/);
});
