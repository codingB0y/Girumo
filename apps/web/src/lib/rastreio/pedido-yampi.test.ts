import assert from "node:assert/strict";
import { test } from "node:test";
import { docHmac } from "@/lib/rastreio/documento";
import { dataDaYampi, pedidoDaYampi } from "@/lib/rastreio/pedido-yampi";
import { gerarCnpj, PEDIDO_CPF, pedidoYampi } from "@/test/rastreio-dados-falsos";

const PEPPER = "p".repeat(32);
const brt = (d: string) => ({ date: `${d}.000000`, timezone_type: 3, timezone: "America/Sao_Paulo" });
const cliente = (extra: Record<string, unknown>) => pedidoYampi({ customer: { data: extra } });

test("o pedido da Yampi vira o pedido para gravar", () => {
  assert.deepEqual(pedidoDaYampi(pedidoYampi(), PEPPER), {
    externalId: "90001", numero: "1042", orderCreatedAt: "2026-10-27T13:15:00.000Z", statusRaw: "on_carriage", etapa: "enviado",
    trackingCode: "QA123456789BR", trackingUrl: "https://rastreio.exemplo/QA123456789BR", shipmentService: "PAC",
    buyerFirstName: "Maria", buyerPhone: "5511987654321", buyerEmail: "maria.teste@exemplo.com", docHmac: docHmac(PEDIDO_CPF, PEPPER),
    historico: [ // on_carriage sem código = separando, junta com o anterior; a etapa atual entra com o updated_at
      { etapa: "aguardando_pagamento", at: "2026-10-27T13:15:00.000Z" }, { etapa: "confirmado", at: "2026-10-27T13:20:00.000Z" },
      { etapa: "separando", at: "2026-10-28T11:00:00.000Z" }, { etapa: "enviado", at: "2026-10-29T12:30:00.000Z" },
    ],
    atualizadoNaYampi: "2026-10-29T12:30:00.000Z",
  });
});

test("include sem data e data em texto", () => {
  const p = pedidoDaYampi(pedidoYampi({
    status: { alias: "paid" }, track_code: null, created_at: "2026-10-27 10:15:00", updated_at: "2026-10-29T12:30:00Z",
    statuses: undefined, customer: { name: "Ana", phone: { area_code: 21, number: 912345678 } },
  }), PEPPER);
  assert.ok(p);
  assert.deepEqual(
    [p.etapa, p.buyerPhone, p.buyerFirstName, p.docHmac, p.buyerEmail, p.historico, p.orderCreatedAt, p.atualizadoNaYampi],
    ["confirmado", "5521912345678", "Ana", null, null, [], "2026-10-27T13:15:00.000Z", "2026-10-29T12:30:00.000Z"],
  );
});

test("telefone em qualquer formato", () => {
  const fone = (phone: unknown) => pedidoDaYampi(cliente({ name: "Ana", phone }), PEPPER)?.buyerPhone;
  assert.equal(fone({ full_number: "5511987654321" }), "5511987654321");
  assert.equal(fone({ area_code: "11", number: "987654321", full_number: "987654321" }), "5511987654321");
  assert.equal(fone(undefined), null);
});

test("PJ: CNPJ, e o nome da empresa não vira primeiro nome", () => {
  const c = gerarCnpj("112223330001");
  const pj = { type: "j", name: "Confeccoes Exemplo Ltda", cpf: null, cnpj: `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` };
  const a = pedidoDaYampi(cliente(pj), PEPPER);
  assert.deepEqual([a?.docHmac, a?.buyerFirstName], [docHmac(c, PEPPER), null]);
  assert.equal(pedidoDaYampi(cliente({ ...pj, first_name: "Bia" }), PEPPER)?.buyerFirstName, "Bia");
});

test("só vai limpo para mensagem e página", () => {
  for (const name of ["www.golpe.com", "Ana2"]) assert.equal(pedidoDaYampi(cliente({ name }), PEPPER)?.buyerFirstName, null, name);
  const sujo = pedidoDaYampi(pedidoYampi({
    track_url: "javascript:alert(1)",
    customer: { data: { name: "Ana", email: "sem-arroba", cpf: PEDIDO_CPF.slice(0, -1) + String((Number(PEDIDO_CPF.slice(-1)) + 1) % 10) } },
  }), PEPPER);
  assert.deepEqual([sujo?.buyerEmail, sujo?.trackingUrl, sujo?.docHmac], [null, null, null]);
});

test("payload fora do formato", () => {
  for (const x of [null, "x", {}, pedidoYampi({ id: undefined }), pedidoYampi({ updated_at: "ontem" }), pedidoYampi({ status: undefined })])
    assert.equal(pedidoDaYampi(x, PEPPER), null);
});

test("histórico sem data fica vazio", () => {
  const p = pedidoDaYampi(pedidoYampi({ statuses: { data: [{ status: { data: { alias: "paid" } } }] } }), PEPPER);
  assert.deepEqual(p?.historico, []);
});

test("dataDaYampi", () => {
  const ISO = "2026-10-29T12:30:00.000Z";
  for (const v of ["2026-10-29 09:30:00", "2026-10-29T12:30:00Z", "2026-10-29T09:30:00-03:00", "2026-10-29T12:30:00+0000", brt("2026-10-29 09:30:00"), { date: "2026-10-29 12:30:00.000000", timezone: "UTC" }])
    assert.equal(dataDaYampi(v), ISO, JSON.stringify(v));
  for (const v of ["29/10/2026", null, 42]) assert.equal(dataDaYampi(v), null);
});

test("include vazio conta como ausente, não derruba o pedido", () => {
  const p = pedidoDaYampi(pedidoYampi({ customer: { data: [] } }), PEPPER);
  assert.ok(p);
  assert.deepEqual([p.buyerFirstName, p.buyerPhone, p.buyerEmail, p.docHmac], [null, null, null, null]);
});

test("e-mail acima de 254 caracteres é descartado antes do regex", () => {
  const longo = `a@${".".repeat(20000)} `;
  const t0 = Date.now();
  assert.equal(pedidoDaYampi(cliente({ name: "Ana", email: longo }), PEPPER)?.buyerEmail, null);
  assert.ok(Date.now() - t0 < 500);
  assert.equal(pedidoDaYampi(cliente({ name: "Ana", email: `${"a".repeat(250)}@b.co` }), PEPPER)?.buyerEmail, null);
});

test("código de rastreio e serviço de envio têm teto e perdem caracteres de controle", () => {
  const p = (extra: Record<string, unknown>) => pedidoDaYampi(pedidoYampi(extra), PEPPER);
  assert.equal(p({ track_code: "A".repeat(81) })?.trackingCode, null);
  assert.equal(p({ track_code: "A".repeat(80) })?.trackingCode, "A".repeat(80));
  assert.equal(p({ track_code: "QA12\n34BR" })?.trackingCode, "QA1234BR");
  assert.equal(p({ shipment_service: "S".repeat(200) })?.shipmentService, "S".repeat(80));
  assert.equal(p({ shipment_service: "PA\r\nC" })?.shipmentService, "PAC");
});
