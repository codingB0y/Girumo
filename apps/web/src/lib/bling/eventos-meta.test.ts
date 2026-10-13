import test from "node:test";
import assert from "node:assert/strict";

import { temSinalDeCasamento } from "@/lib/campaigns/meta-capi";
import type { HashesMeta } from "@/lib/meta/dados-do-cliente";

import {
  escolherPixel,
  eventoInitiateCheckout,
  eventoPurchase,
  faixaDoValor,
  opcoesDePixel,
  temDadosDeCasamento,
  type CampanhaComMetadata,
  type EntradaEvento,
} from "./eventos-meta";

const HASHES: HashesMeta = {
  em: ["em1"],
  ph: ["ph1", "ph2"],
  fn: "fn1",
  ln: "ln1",
  db: "db1",
  doby: "y1",
  dobm: "m1",
  dobd: "d1",
  ge: "ge1",
  ct: "ct1",
  st: "st1",
  zp: "zp1",
  country: "br1",
  external_id: "ext1",
};

const QUANDO = new Date("2026-10-13T15:30:45.678Z");

const ENTRADA: EntradaEvento = {
  pedidoBlingId: 123,
  numero: "1050",
  total: 199.899999,
  quando: QUANDO,
  hashes: HASHES,
  fbc: "fb.1.1760000000000.IwAR1",
  fbp: "fb.1.1.2",
  origem: "anuncio",
  faixa: "alto",
};

const USER_DATA = {
  em: ["em1"],
  ph: ["ph1", "ph2"],
  fn: "fn1",
  ln: "ln1",
  db: "db1",
  ge: "ge1",
  ct: "ct1",
  st: "st1",
  zp: "zp1",
  country: "br1",
  external_id: "ext1",
  fbc: "fb.1.1760000000000.IwAR1",
  fbp: "fb.1.1.2",
};

test("InitiateCheckout: chat, event_id fixo por pedido, tempo em SEGUNDOS, BRL", () => {
  assert.deepEqual(eventoInitiateCheckout(ENTRADA), {
    event_name: "InitiateCheckout",
    event_time: Math.floor(QUANDO.getTime() / 1000),
    event_id: "bling-ic-123",
    action_source: "chat",
    user_data: USER_DATA,
    custom_data: { value: 199.9, currency: "BRL", order_id: "1050" },
  });
});

test("Purchase: + origem e faixa no custom_data", () => {
  assert.deepEqual(eventoPurchase(ENTRADA), {
    event_name: "Purchase",
    event_time: Math.floor(QUANDO.getTime() / 1000),
    event_id: "bling-123",
    action_source: "chat",
    user_data: USER_DATA,
    custom_data: { value: 199.9, currency: "BRL", order_id: "1050", origem: "anuncio", faixa: "alto" },
  });
});

test("user_data: sem doby/dobm/dobd (são do CSV) e sem fbc/fbp ausentes", () => {
  const u = eventoPurchase({ ...ENTRADA, fbc: null, fbp: null }).user_data;
  for (const campo of ["doby", "dobm", "dobd", "fbc", "fbp"]) {
    assert.equal(campo in u, false, `user_data não pode levar ${campo}`);
  }
  assert.equal(u.db, "db1");
});

test("user_data: só os campos que o cliente tem", () => {
  const u = eventoInitiateCheckout({ ...ENTRADA, hashes: { ph: ["ph1"] }, fbc: null, fbp: null }).user_data;
  assert.deepEqual(u, { ph: ["ph1"] });
});

test("order_id: número do pedido; sem número, o id do Bling", () => {
  assert.equal(eventoPurchase({ ...ENTRADA, numero: null }).custom_data.order_id, "123");
  assert.equal(eventoPurchase({ ...ENTRADA, numero: "" }).custom_data.order_id, "123");
});

test("value com 2 casas (tira o ruído do ponto flutuante)", () => {
  assert.equal(eventoPurchase({ ...ENTRADA, total: 0.1 + 0.2 }).custom_data.value, 0.3);
  assert.equal(eventoPurchase({ ...ENTRADA, total: 50 }).custom_data.value, 50);
});

test("temDadosDeCasamento: e-mail, telefone, external_id, fbc ou fbp", () => {
  assert.equal(temDadosDeCasamento({}, null, null), false);
  assert.equal(temDadosDeCasamento({ fn: "a", ln: "b", ct: "c", st: "d", zp: "e", country: "f", db: "g" }, null, null), false);
  assert.equal(temDadosDeCasamento({ em: [], ph: [] }, null, null), false);
  assert.equal(temDadosDeCasamento({ em: ["x"] }, null, null), true);
  assert.equal(temDadosDeCasamento({ ph: ["x"] }, null, null), true);
  assert.equal(temDadosDeCasamento({ external_id: "x" }, null, null), true);
  assert.equal(temDadosDeCasamento({}, "fb.1.1.x", null), true);
  assert.equal(temDadosDeCasamento({}, null, "fb.1.1.2"), true);
});

test("temDadosDeCasamento concorda com a guarda do sendCapiEvent", () => {
  const casos: Array<[HashesMeta, string | null, string | null]> = [
    [{}, null, null],
    [{ country: "br1" }, null, null],
    [{ em: ["x"] }, null, null],
    [{ external_id: "x" }, null, null],
    [{}, null, "fb.1.1.2"],
  ];
  for (const [hashes, fbc, fbp] of casos) {
    const ev = eventoPurchase({ ...ENTRADA, hashes, fbc, fbp });
    assert.equal(temSinalDeCasamento(ev.user_data), temDadosDeCasamento(hashes, fbc, fbp), JSON.stringify(hashes));
  }
});

test("faixaDoValor: alto só com valor alto definido e total ≥ ele", () => {
  assert.equal(faixaDoValor(1000, null), "normal");
  assert.equal(faixaDoValor(100, 100), "alto");
  assert.equal(faixaDoValor(500, 100), "alto");
  assert.equal(faixaDoValor(99.99, 100), "normal");
});

const TOKEN = "EAAtoken";
const campanha = (id: string, meta: Record<string, string> | null): CampanhaComMetadata => ({
  id,
  name: `Campanha ${id}`,
  metadata: meta ? { settings: { integracoes: { meta: { evento: "Lead", ...meta } } } } : null,
});

const A = campanha("a", { pixel_id: "11111", capi_token: TOKEN, test_code: "TEST1" });
const B_SEM_TOKEN = campanha("b", { pixel_id: "22222" });
const C_SEM_PIXEL = campanha("c", { capi_token: TOKEN });
const D_SEM_METADATA = campanha("d", null);
const E_MESMO_PIXEL = campanha("e", { pixel_id: "11111", capi_token: "EAAoutro", test_code: "" });
const F_OUTRO_PIXEL = campanha("f", { pixel_id: "33333", capi_token: TOKEN });

test("opcoesDePixel: só campanhas com pixel E token; test_code vazio vira null", () => {
  assert.deepEqual(opcoesDePixel([A, B_SEM_TOKEN, C_SEM_PIXEL, D_SEM_METADATA, E_MESMO_PIXEL]), [
    { campaignId: "a", pixelId: "11111", token: TOKEN, testCode: "TEST1" },
    { campaignId: "e", pixelId: "11111", token: "EAAoutro", testCode: null },
  ]);
});

test("escolherPixel: a escolhida vale quando é uma opção", () => {
  const r = escolherPixel([A, F_OUTRO_PIXEL], "f");
  assert.deepEqual(r, { ok: true, pixel: { campaignId: "f", pixelId: "33333", token: TOKEN, testCode: null } });
});

test("escolherPixel: sem escolha válida, um pixel só (mesmo em várias campanhas) → a primeira com ele", () => {
  for (const escolhida of [null, "inexistente", "b"]) {
    const r = escolherPixel([B_SEM_TOKEN, A, E_MESMO_PIXEL], escolhida);
    assert.equal(r.ok && r.pixel.campaignId, "a", String(escolhida));
  }
});

test("escolherPixel implícito: a campanha de menor id, seja qual for a ordem, e sem test_code", () => {
  const esperado = { ok: true, pixel: { campaignId: "a", pixelId: "11111", token: TOKEN, testCode: null } };
  for (const campanhas of [[A, E_MESMO_PIXEL], [E_MESMO_PIXEL, A], [E_MESMO_PIXEL, B_SEM_TOKEN, A]]) {
    assert.deepEqual(escolherPixel(campanhas, null), esperado, campanhas.map((c) => c.id).join(","));
  }
});

test("escolherPixel: test_code só vale quando a loja escolheu a campanha", () => {
  assert.deepEqual(escolherPixel([E_MESMO_PIXEL, A], "a"), {
    ok: true,
    pixel: { campaignId: "a", pixelId: "11111", token: TOKEN, testCode: "TEST1" },
  });
});

test("escolherPixel: pixels diferentes e nenhuma escolha válida → varios", () => {
  assert.deepEqual(escolherPixel([A, F_OUTRO_PIXEL], null), { ok: false, motivo: "varios" });
  assert.deepEqual(escolherPixel([A, F_OUTRO_PIXEL], "b"), { ok: false, motivo: "varios" });
});

test("escolherPixel: nenhuma campanha com pixel e token → sem_pixel", () => {
  assert.deepEqual(escolherPixel([], null), { ok: false, motivo: "sem_pixel" });
  assert.deepEqual(escolherPixel([B_SEM_TOKEN, C_SEM_PIXEL, D_SEM_METADATA], "b"), { ok: false, motivo: "sem_pixel" });
});
