import { strict as assert } from "node:assert";
import { test } from "node:test";
import { decidirLiberacao } from "./liberacao-admin";

test("ligar exige a confirmação do aviso de privacidade; com assinatura no Stripe é permitido", () => {
  assert.deepEqual(decidirLiberacao({ acao: "ligar", avisoConfirmado: false, assinaturaNoStripe: false }), {
    ok: false,
    status: 400,
    error: "Confirme que o lojista foi avisado do texto de privacidade.",
  });
  assert.deepEqual(decidirLiberacao({ acao: "ligar", avisoConfirmado: true, assinaturaNoStripe: false }), { ok: true });
  assert.deepEqual(decidirLiberacao({ acao: "ligar", avisoConfirmado: true, assinaturaNoStripe: true }), { ok: true });
});

test("desligar uma loja com assinatura viva no Stripe é recusado; sem assinatura passa", () => {
  assert.deepEqual(decidirLiberacao({ acao: "desligar", avisoConfirmado: false, assinaturaNoStripe: true }), {
    ok: false,
    status: 409,
    error:
      "Esta loja tem assinatura do Recuperar viva no Stripe. Desligar aqui não para a cobrança e o próximo evento do Stripe liga de novo: cancele a assinatura no Dashboard do Stripe.",
  });
  assert.deepEqual(decidirLiberacao({ acao: "desligar", avisoConfirmado: false, assinaturaNoStripe: false }), { ok: true });
});
