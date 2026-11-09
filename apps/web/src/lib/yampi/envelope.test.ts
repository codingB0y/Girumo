import assert from "node:assert/strict";
import { test } from "node:test";

import { avisoForaDaJanela, chaveDeDedupe, lerEnvelope } from "./envelope";
import { EVENTOS_YAMPI } from "./tipos";

const aviso = (extra: Record<string, unknown> = {}) => ({
  event: "order.paid", time: "2026-10-29 10:00:00", merchant: { id: 1, alias: "loja-exemplo" }, resource: { id: 42 }, ...extra,
});

test("os cinco eventos viram evento tipado, com alias, time, recurso e o id do recurso como texto", () => {
  for (const evento of EVENTOS_YAMPI) {
    assert.deepEqual(lerEnvelope(aviso({ event: evento })), {
      ok: true, envelope: { evento, time: "2026-10-29 10:00:00", alias: "loja-exemplo", recursoId: "42", recurso: { id: 42 } },
    });
  }
});

test("recurso sem id legível: recursoId nulo e o aviso segue válido", () => {
  for (const resource of [{ numero: 5 }, null, "x", { id: {} }]) {
    const r = lerEnvelope(aviso({ resource }));
    assert.equal(r.ok, true, JSON.stringify(resource));
    assert.equal(r.ok && r.envelope.recursoId, null);
  }
});

test("outro evento é outro_evento, mesmo sem merchant ou resource; caixa diferente também", () => {
  assert.deepEqual(lerEnvelope({ event: "product.updated" }), { ok: false, motivo: "outro_evento" });
  assert.deepEqual(lerEnvelope(aviso({ event: "Order.Paid" })), { ok: false, motivo: "outro_evento" });
});

test("corpo que não é objeto, sem event string ou sem merchant.alias: formato", () => {
  for (const ruim of [null, undefined, "x", 42, [], [aviso()], {}, aviso({ event: 7 }), aviso({ merchant: {} }), aviso({ merchant: { alias: "" } }), aviso({ merchant: null })]) {
    assert.deepEqual(lerEnvelope(ruim), { ok: false, motivo: "formato" }, JSON.stringify(ruim));
  }
});

test("chaveDeDedupe: o mesmo corpo na mesma conexão repete; outro corpo ou outra conexão muda", () => {
  const a = new TextEncoder().encode("{}");
  const b = new TextEncoder().encode("{} ");
  assert.match(chaveDeDedupe("c1", a), /^c1:[0-9a-f]{64}$/);
  assert.equal(chaveDeDedupe("c1", a), chaveDeDedupe("c1", a));
  assert.notEqual(chaveDeDedupe("c1", a), chaveDeDedupe("c1", b));
  assert.notEqual(chaveDeDedupe("c1", a), chaveDeDedupe("c2", a));
});

test("avisoForaDaJanela: lê o time em hora de Brasília; mais de 7 dias ou mais de 5 min no futuro fica fora; ilegível fica dentro", () => {
  const agora = Date.parse("2026-11-09T15:00:00Z"); // 12:00 em Brasília
  assert.equal(avisoForaDaJanela("2026-11-09 12:00:00", agora), false);
  assert.equal(avisoForaDaJanela("2026-11-02 12:00:01", agora), false); // 7 dias menos 1 s
  assert.equal(avisoForaDaJanela("2026-11-02 11:59:59", agora), true);
  assert.equal(avisoForaDaJanela("2026-11-09 12:04:59", agora), false); // relógio da Yampi adiantado (Y5)
  assert.equal(avisoForaDaJanela("2026-11-09 12:05:01", agora), true);
  for (const ilegivel of [null, "", "2026-11-09T12:00:00Z", "ontem", "2026-13-45 99:99:99"]) {
    assert.equal(avisoForaDaJanela(ilegivel, agora), false, String(ilegivel));
  }
});
