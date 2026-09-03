import assert from "node:assert/strict";
import test from "node:test";

import {
  decideInviteReview,
  etaRevisaoMin,
  formataEta,
  resumoRevisao,
} from "./invite-review";

const GUARDADO = "https://chat.whatsapp.com/ABCdef123456";

test("convite igual ao guardado: same, sem reescrever nada", () => {
  const r = decideInviteReview({ guardado: GUARDADO, lido: GUARDADO });
  assert.deepEqual(r, { grava: true, verdict: "same" });
});

test("convite diferente: changed e devolve o novo para gravar", () => {
  const novo = "https://chat.whatsapp.com/ZZZnovo999999";
  const r = decideInviteReview({ guardado: GUARDADO, lido: novo });
  assert.deepEqual(r, { grava: true, verdict: "changed", inviteUrl: novo });
});

test("formato antigo do guardado nao vira 'trocado' eterno", () => {
  // O mesmo convite em tres formas que a normalizacao aceita. Comparar string
  // crua marcaria "changed" toda revisao num link que nunca mudou.
  for (const antigo of [
    "chat.whatsapp.com/invite/ABCdef123456",
    "https://www.chat.whatsapp.com/ABCdef123456",
    "ABCdef123456",
  ]) {
    const r = decideInviteReview({ guardado: antigo, lido: GUARDADO });
    assert.deepEqual(r, { grava: true, verdict: "same" }, `falhou para ${antigo}`);
  }
});

test("200 sem convite utilizavel e broken: nao ha link para divulgar", () => {
  assert.deepEqual(decideInviteReview({ guardado: GUARDADO, lido: null }), {
    grava: true,
    verdict: "broken",
  });
  // Um convite de OUTRO dominio nao e convite: `normalizeInviteUrl` recusa, e
  // aceitar seria gravar um funil furado direto no banco. (Codigo solto sem
  // dominio, esse sim, e aceito de proposito — ver invite-url.ts.)
  assert.deepEqual(decideInviteReview({ guardado: GUARDADO, lido: "https://evil.example/abc123" }), {
    grava: true,
    verdict: "broken",
  });
  assert.deepEqual(decideInviteReview({ guardado: GUARDADO, lido: "curto" }), {
    grava: true,
    verdict: "broken",
  });
});

test("falha permanente (perdeu admin) e broken", () => {
  const r = decideInviteReview({
    guardado: GUARDADO,
    falha: { status: 404, detail: "not-authorized" },
  });
  assert.deepEqual(r, { grava: true, verdict: "broken" });
});

test("falha PASSAGEIRA nao grava nada — a revisao nao aconteceu", () => {
  // Este e o teste que impede a mentira: dizer "quebrado" porque a Evolution
  // caiu acusaria 91 grupos bons de estarem quebrados.
  for (const falha of [{ status: 0 }, { status: 503 }]) {
    const r = decideInviteReview({ guardado: GUARDADO, falha });
    assert.equal(r.grava, false, `status ${falha.status} deveria nao gravar`);
    if (r.grava === false) assert.ok(r.motivo.length > 0, "motivo vazio");
  }
});

test("resumo separa nunca-revisado de quebrado", () => {
  const r = resumoRevisao([
    { invite_check: "same", invite_checked_at: "2026-09-03T10:00:00.000Z" },
    { invite_check: "same", invite_checked_at: "2026-09-03T12:00:00.000Z" },
    { invite_check: "changed", invite_checked_at: "2026-09-03T11:00:00.000Z" },
    { invite_check: "broken", invite_checked_at: "2026-09-03T09:00:00.000Z" },
    { invite_check: null, invite_checked_at: null },
    {},
  ]);
  assert.deepEqual(r, {
    iguais: 2,
    trocados: 1,
    quebrados: 1,
    naoRevisados: 2,
    ultimaRevisao: "2026-09-03T12:00:00.000Z",
  });
});

test("resumo de lista vazia nao inventa data", () => {
  assert.equal(resumoRevisao([]).ultimaRevisao, null);
});

test("ETA da revisão segue o ritmo do lote (15/min)", () => {
  assert.equal(etaRevisaoMin(1), 1);
  assert.equal(etaRevisaoMin(91), 7);
  assert.equal(etaRevisaoMin(200), 14);
});

test("ETA nunca cai a zero e nao inventa fracao de minuto", () => {
  assert.equal(etaRevisaoMin(0), 1);
  assert.equal(formataEta(91), "≈ 1 h 31");
  assert.equal(formataEta(45), "≈ 45 min");
  assert.equal(formataEta(120), "≈ 2 h");
});
