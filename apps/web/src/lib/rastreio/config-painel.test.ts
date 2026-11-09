import assert from "node:assert/strict";
import { test } from "node:test";

import { alternarCanal, corpoDoPatchDaConfig, erroDoPatchDaConfig } from "@/lib/rastreio/config-painel";
import { MATRIZ_PADRAO } from "@/lib/rastreio/tipos";

const falha = (corpo: unknown) => {
  const r = corpoDoPatchDaConfig.safeParse(corpo);
  assert.equal(r.success, false);
  return erroDoPatchDaConfig(r.error!);
};

test("matriz sem uma etapa ou com etapa extra: erro no campo matrix", () => {
  const semEntregue = { ...MATRIZ_PADRAO } as Partial<typeof MATRIZ_PADRAO>;
  delete semEntregue.entregue;
  assert.deepEqual(falha({ matrix: semEntregue }), { error: "Escolha os avisos de todas as etapas.", campo: "matrix" });
  assert.equal(falha({ matrix: { ...MATRIZ_PADRAO, aguardando_pagamento: { whatsapp: true, email: true } } }).campo, "matrix");
  assert.equal(corpoDoPatchDaConfig.safeParse({ matrix: MATRIZ_PADRAO }).success, true);
});

test("alternarCanal devolve cópia e não muda o original", () => {
  const nova = alternarCanal(MATRIZ_PADRAO, "confirmado", "email");
  assert.notEqual(nova, MATRIZ_PADRAO);
  assert.equal(nova.confirmado.email, true);
  assert.equal(MATRIZ_PADRAO.confirmado.email, false);
  assert.equal(nova.enviado, MATRIZ_PADRAO.enviado);
});

test("publicSlug: formato e reservado", () => {
  assert.deepEqual(falha({ publicSlug: "AB" }), {
    error: "Use de 3 a 40 letras minúsculas, números e hífen, sem espaço nem acento.",
    campo: "publicSlug",
  });
  assert.deepEqual(falha({ publicSlug: "loja-girumo" }), { error: "Esse endereço é reservado. Escolha outro.", campo: "publicSlug" });
  assert.deepEqual(corpoDoPatchDaConfig.parse({ publicSlug: "loja-exemplo" }), { publicSlug: "loja-exemplo" });
});

test("storeWhatsapp: vazio vira null, número vira 55+DDD+número, lixo é erro", () => {
  assert.deepEqual(corpoDoPatchDaConfig.parse({ storeWhatsapp: "" }), { storeWhatsapp: null });
  assert.deepEqual(corpoDoPatchDaConfig.parse({ storeWhatsapp: null }), { storeWhatsapp: null });
  assert.deepEqual(corpoDoPatchDaConfig.parse({ storeWhatsapp: "(11) 91234-5678" }), { storeWhatsapp: "5511912345678" });
  assert.deepEqual(falha({ storeWhatsapp: "123" }), {
    error: "Informe um WhatsApp com DDD, ex.: (11) 91234-5678.",
    campo: "storeWhatsapp",
  });
});

test("vipLinkId: uuid minúsculo ou null", () => {
  assert.deepEqual(corpoDoPatchDaConfig.parse({ vipLinkId: null }), { vipLinkId: null });
  assert.equal(falha({ vipLinkId: "nao-e-uuid" }).campo, "vipLinkId");
  assert.equal(falha({ vipLinkId: "0B6F1C2A-3D4E-4F5A-8B6C-7D8E9F0A1B2C" }).campo, "vipLinkId");
});

test("corpo vazio, chave desconhecida ou não-objeto: campo corpo", () => {
  assert.deepEqual(falha({}), { error: "Corpo inválido.", campo: "corpo" });
  assert.equal(falha({ publicSlug: "loja-exemplo", extra: 1 }).campo, "corpo");
  assert.equal(falha("oi").campo, "corpo");
});

test("tipo errado cai numa mensagem em português, não no inglês do zod", () => {
  assert.equal(falha({ notifyStoreOnProblem: "x" }).error, "Valor inválido.");
  assert.equal(falha({ vipLinkId: 5 }).error, "Esse link não é da sua loja.");
  assert.equal(falha({ publicSlug: 3 }).error, "Use de 3 a 40 letras minúsculas, números e hífen, sem espaço nem acento.");
  assert.equal(falha({ storeWhatsapp: 5 }).error, "Informe um WhatsApp com DDD, ex.: (11) 91234-5678.");
});
