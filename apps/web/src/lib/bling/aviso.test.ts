import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { assinaturaBlingConfere, LIMITE_CORPO_AVISO, lerAviso } from "./aviso";

const SEGREDO = "client-secret-do-app";
const CORPO =
  '{"eventId":"01945027-150e-72b4-e7cf-4943a042cd9c","date":"2025-01-10T12:18:46Z","version":"v1","event":"order.updated","companyId":"d4475854366a36c86a37e792f9634a51","data":{"id":12345678,"total":150}}';
const hmacHex = (corpo: string, segredo = SEGREDO) => createHmac("sha256", segredo).update(corpo, "utf8").digest("hex");
const BOA = `sha256=${hmacHex(CORPO)}`;

test("limite do corpo é 64 KB", () => {
  assert.equal(LIMITE_CORPO_AVISO, 65536);
});

test("assinatura certa confere, com hex em qualquer caixa e espaço em volta", () => {
  assert.equal(assinaturaBlingConfere(CORPO, BOA, SEGREDO), true);
  assert.equal(assinaturaBlingConfere(CORPO, `sha256=${hmacHex(CORPO).toUpperCase()}`, SEGREDO), true);
  assert.equal(assinaturaBlingConfere(CORPO, `  ${BOA} `, SEGREDO), true);
});

test("o HMAC é sobre os bytes UTF-8 do corpo (acento e emoji)", () => {
  const corpo = '{"event":"order.created","data":{"id":1},"obs":"Conceição 💜"}';
  const esperado = createHmac("sha256", SEGREDO).update(Buffer.from(corpo, "utf8")).digest("hex");
  assert.equal(assinaturaBlingConfere(corpo, `sha256=${esperado}`, SEGREDO), true);
});

test("corpo em bytes: o HMAC é sobre os bytes crus, com BOM ou byte UTF-8 inválido", () => {
  const json = new TextEncoder().encode('{"event":"order.created","data":{"id":1}}');
  const comBom = Uint8Array.from([0xef, 0xbb, 0xbf, ...json]);
  const comByteInvalido = Uint8Array.from([...json.subarray(0, 10), 0xff, ...json.subarray(10)]);
  for (const bytes of [comBom, comByteInvalido, Buffer.from(comBom)]) {
    const cabecalho = `sha256=${createHmac("sha256", SEGREDO).update(bytes).digest("hex")}`;
    assert.equal(assinaturaBlingConfere(bytes, cabecalho, SEGREDO), true);
    // Decodificar antes de conferir perde esses bytes (o BOM some, 0xFF vira U+FFFD): não bate mais.
    assert.equal(assinaturaBlingConfere(new TextDecoder().decode(bytes), cabecalho, SEGREDO), false);
    assert.equal(assinaturaBlingConfere(Uint8Array.from([...bytes, 0x20]), cabecalho, SEGREDO), false);
  }
});

test("corpo alterado ou segredo errado: não confere", () => {
  assert.equal(assinaturaBlingConfere(`${CORPO} `, BOA, SEGREDO), false);
  assert.equal(assinaturaBlingConfere(CORPO, BOA, "outro-segredo"), false);
});

test("cabeçalho ausente ou vazio, segredo vazio: não confere", () => {
  assert.equal(assinaturaBlingConfere(CORPO, null, SEGREDO), false);
  assert.equal(assinaturaBlingConfere(CORPO, "", SEGREDO), false);
  assert.equal(assinaturaBlingConfere(CORPO, BOA, ""), false);
});

test("prefixo errado ou ausente: não confere", () => {
  const hex = hmacHex(CORPO);
  assert.equal(assinaturaBlingConfere(CORPO, hex, SEGREDO), false);
  assert.equal(assinaturaBlingConfere(CORPO, `sha1=${hex}`, SEGREDO), false);
  assert.equal(assinaturaBlingConfere(CORPO, `sha512=${hex}`, SEGREDO), false);
  assert.equal(assinaturaBlingConfere(CORPO, `sha256:${hex}`, SEGREDO), false);
  assert.equal(assinaturaBlingConfere(CORPO, `sha256= ${hex}`, SEGREDO), false);
});

test("hex com tamanho errado ou que não é hex: não confere (e não lança)", () => {
  const hex = hmacHex(CORPO);
  assert.equal(assinaturaBlingConfere(CORPO, "sha256=", SEGREDO), false);
  assert.equal(assinaturaBlingConfere(CORPO, `sha256=${hex.slice(0, 63)}`, SEGREDO), false);
  assert.equal(assinaturaBlingConfere(CORPO, `sha256=${hex}0`, SEGREDO), false);
  assert.equal(assinaturaBlingConfere(CORPO, `sha256=${hex}00`, SEGREDO), false);
  assert.equal(assinaturaBlingConfere(CORPO, `sha256=${"zz".repeat(32)}`, SEGREDO), false);
  assert.equal(assinaturaBlingConfere(CORPO, `sha256=${hex.slice(0, 62)}g0`, SEGREDO), false);
});

const envelope = (extra: Record<string, unknown> = {}) => ({
  eventId: "01945027-150e-72b4-e7cf-4943a042cd9c",
  date: "2025-01-10T12:18:46Z",
  version: "v1",
  event: "order.updated",
  companyId: "d4475854366a36c86a37e792f9634a51",
  data: {
    id: 12345678,
    data: "2024-09-25",
    numero: 123,
    total: 150,
    contato: { id: 987 },
    situacao: { id: 9, valor: 1 },
  },
  ...extra,
});

test("order.updated com id numérico: aviso lido", () => {
  assert.deepEqual(lerAviso(envelope()), {
    ok: true,
    aviso: {
      eventoId: "01945027-150e-72b4-e7cf-4943a042cd9c",
      evento: "order.updated",
      empresaId: "d4475854366a36c86a37e792f9634a51",
      pedidoId: 12345678,
    },
  });
});

test("order.created com id em string de dígitos: vira número", () => {
  const r = lerAviso(envelope({ event: "order.created", data: { id: "12345678" } }));
  assert.deepEqual(r, {
    ok: true,
    aviso: {
      eventoId: "01945027-150e-72b4-e7cf-4943a042cd9c",
      evento: "order.created",
      empresaId: "d4475854366a36c86a37e792f9634a51",
      pedidoId: 12345678,
    },
  });
});

test("order.deleted traz só o id em data: aviso lido", () => {
  const r = lerAviso(envelope({ event: "order.deleted", data: { id: 555 } }));
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.aviso.evento, "order.deleted");
  assert.equal(r.ok && r.aviso.pedidoId, 555);
});

test("id no limite do inteiro seguro passa, como número e como string", () => {
  const max = Number.MAX_SAFE_INTEGER;
  const comoNumero = lerAviso(envelope({ data: { id: max } }));
  const comoTexto = lerAviso(envelope({ data: { id: String(max) } }));
  assert.equal(comoNumero.ok && comoNumero.aviso.pedidoId, max);
  assert.equal(comoTexto.ok && comoTexto.aviso.pedidoId, max);
});

test("outro recurso do Bling (produto, estoque, nota): outro_evento, mesmo sem data.id", () => {
  assert.deepEqual(lerAviso(envelope({ event: "product.created", data: { id: 1 } })), {
    ok: false,
    motivo: "outro_evento",
  });
  assert.deepEqual(lerAviso(envelope({ event: "stock.updated", data: { produto: { id: 1 } } })), {
    ok: false,
    motivo: "outro_evento",
  });
  assert.deepEqual(lerAviso(envelope({ event: "invoice.created", data: { id: 1 } })), {
    ok: false,
    motivo: "outro_evento",
  });
  assert.deepEqual(lerAviso(envelope({ event: "Order.Updated" })), { ok: false, motivo: "outro_evento" });
});

test("corpo que não é objeto: formato", () => {
  for (const json of [null, undefined, "texto", 42, [], [envelope()]]) {
    assert.deepEqual(lerAviso(json), { ok: false, motivo: "formato" }, `json ${JSON.stringify(json)}`);
  }
});

const envelopeSem = (chave: string) => Object.fromEntries(Object.entries(envelope()).filter(([k]) => k !== chave));

test("envelope sem eventId/companyId/event válidos: formato", () => {
  const casos: unknown[] = [
    {},
    envelopeSem("eventId"),
    envelopeSem("companyId"),
    envelopeSem("event"),
    envelopeSem("data"),
    envelope({ eventId: "" }),
    envelope({ eventId: 123 }),
    envelope({ eventId: "x".repeat(201) }),
    envelope({ companyId: "" }),
    envelope({ companyId: 42 }),
    envelope({ companyId: "c".repeat(201) }),
    envelope({ event: 7 }),
    envelope({ event: null }),
  ];
  for (const caso of casos) {
    assert.deepEqual(lerAviso(caso), { ok: false, motivo: "formato" }, JSON.stringify(caso).slice(0, 80));
  }
});

test("eventId e companyId de 200 caracteres ainda passam", () => {
  const r = lerAviso(envelope({ eventId: "e".repeat(200), companyId: "c".repeat(200) }));
  assert.equal(r.ok, true);
});

test("evento de pedido sem data.id inteiro positivo: formato", () => {
  const ids: unknown[] = [
    undefined,
    null,
    0,
    -5,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    "",
    "0",
    "12a",
    " 12",
    "-3",
    "1e3",
    "1.0",
    "9007199254740993",
    true,
    { id: 1 },
  ];
  for (const id of ids) {
    assert.deepEqual(lerAviso(envelope({ data: { id } })), { ok: false, motivo: "formato" }, `id ${String(id)}`);
  }
  assert.deepEqual(lerAviso(envelope({ data: undefined })), { ok: false, motivo: "formato" });
  assert.deepEqual(lerAviso(envelope({ data: "12345678" })), { ok: false, motivo: "formato" });
});
