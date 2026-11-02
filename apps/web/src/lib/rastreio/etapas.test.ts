import assert from "node:assert/strict";
import { test } from "node:test";
import type { Etapa } from "@/lib/rastreio/tipos";
import { etapaDaYampi } from "@/lib/rastreio/etapas";

const COD = "QA123456789BR";
const TABELA: Array<[alias: string, codigo: string | null, etapa: Etapa]> = [
  ["waiting_payment", null, "aguardando_pagamento"], ["authorized", null, "aguardando_pagamento"], ["created", null, "aguardando_pagamento"],
  ["waiting_payment", COD, "aguardando_pagamento"], ["paid", null, "confirmado"], ["paid", COD, "enviado"],
  ["handling_products", null, "separando"], ["invoiced", null, "separando"], ["ready_for_shipping", COD, "enviado"],
  ["on_carriage", null, "separando"], ["on_carriage", "  ", "separando"], ["on_carriage", COD, "enviado"],
  ["ready_for_pickup", COD, "retirada"], ["shipment_exception", COD, "problema"], ["delivered", null, "entregue"],
  ["refused", null, "cancelado"], ["cancelled", COD, "cancelado"],
];
test("cada status da Yampi vira a etapa do spec §1.1, com a regra do código de rastreio", () => {
  for (const [statusAlias, trackCode, etapa] of TABELA)
    assert.equal(etapaDaYampi({ statusAlias, trackCode, delivered: false }), etapa, `${statusAlias} + ${trackCode}`);
});
test("delivered = true é entregue, mas cancelado vence", () => {
  assert.equal(etapaDaYampi({ statusAlias: "on_carriage", trackCode: COD, delivered: true }), "entregue");
  assert.equal(etapaDaYampi({ statusAlias: "cancelled", trackCode: null, delivered: true }), "cancelado");
});
test("status desconhecido devolve null e o log leva só o alias", (t) => {
  const avisos: string[] = [];
  t.mock.method(console, "warn", (...a: unknown[]) => avisos.push(a.map(String).join(" ")));
  for (const statusAlias of ["em_disputa", "constructor", null]) // constructor: nada herdado de Object
    assert.equal(etapaDaYampi({ statusAlias, trackCode: COD, delivered: false }), null);
  assert.deepEqual(avisos, ["em_disputa", "constructor", "null"].map((a) => `[rastreio] status da Yampi desconhecido: ${a}`));
});
test("alias desconhecido sai do log sem quebra de linha e com teto de tamanho", (t) => {
  const avisos: string[] = [];
  t.mock.method(console, "warn", (...a: unknown[]) => avisos.push(a.map(String).join(" ")));
  etapaDaYampi({ statusAlias: "x\r\n[rastreio] forjado\u0007" + "y".repeat(200), trackCode: null, delivered: false });
  assert.equal(avisos.length, 1);
  assert.doesNotMatch(avisos[0], /[\u0000-\u001f\u007f]/);
  assert.ok(avisos[0].length <= "[rastreio] status da Yampi desconhecido: ".length + 60);
});
