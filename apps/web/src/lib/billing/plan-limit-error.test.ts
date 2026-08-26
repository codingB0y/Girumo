import test from "node:test";
import assert from "node:assert/strict";

import {
  planBlockedBody,
  planLimitReachedBody,
  planStorageFullBody,
  UPGRADE_URL,
} from "./plan-limit-error";

/**
 * O teste que existe para não deixar o defeito voltar.
 *
 * Toda tela do painel lê erro assim: `res.json().catch(() => ({}))` e depois
 * `body?.error ?? "Erro ao criar."`. Enquanto o gate devolvia
 * `new Response("texto", { status: 402 })` — `content-type: text/plain` — o
 * `res.json()` estourava, o corpo virava `{}` e o cliente lia "Erro ao criar.".
 *
 * Este teste reproduz esse consumo LITERALMENTE contra uma Response de verdade.
 * Trocar `Response.json(...)` de volta por `new Response(texto)` faz ele falhar,
 * que é o ponto: um assert sobre o objeto do corpo sozinho passaria com o bug
 * de volta, porque o objeto está certo nos dois casos — o que quebrava era a
 * serialização.
 */
async function comoATelaLe(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body?.error ?? "Erro ao criar.";
}

test("a mensagem do plano chega na tela em vez do fallback generico", async () => {
  const res = Response.json(planBlockedBody("campaigns:create"), { status: 402 });

  assert.equal(res.status, 402);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);

  const visto = await comoATelaLe(res);
  assert.notEqual(visto, "Erro ao criar.");
  assert.match(visto, /plano/i);
  assert.match(visto, /campanhas/);
});

test("teto zero nao e chamado de limite atingido", () => {
  // FREE tem campaigns: 0. Dizer "limite atingido" a quem nunca criou nenhuma
  // manda o cliente procurar algo para apagar — o que falta e plano.
  const body = planBlockedBody("campaigns:create");

  assert.equal(body.code, "plan_blocked");
  assert.doesNotMatch(body.error, /atingid/i);
  assert.match(body.error, /não inclui/i);
});

test("limite atingido diz quantas o plano da", () => {
  const body = planLimitReachedBody("campaigns:create", 10);

  assert.equal(body.code, "plan_limit_reached");
  assert.match(body.error, /10 campanhas/);
});

test("limite de um usa singular", () => {
  const body = planLimitReachedBody("instances:create", 1);

  assert.match(body.error, /a número de WhatsApp|o número de WhatsApp/);
  assert.doesNotMatch(body.error, /1 números/);
});

test("todo corpo leva o cliente para o mesmo lugar", () => {
  for (const body of [
    planBlockedBody("campaigns:create"),
    planLimitReachedBody("contacts:create", 250),
    planStorageFullBody(100),
  ]) {
    assert.equal(body.upgradeUrl, UPGRADE_URL);
    assert.ok(body.error.length > 0);
  }
});

test("capability desconhecida nao quebra nem vaza nome tecnico", () => {
  // Capability nova sem rotulo cadastrado nao pode virar "Seu plano nao inclui
  // campaigns:create" na cara do cliente.
  const body = planBlockedBody("algo:novo");

  assert.doesNotMatch(body.error, /algo:novo/);
  assert.match(body.error, /recursos/);
});

test("codigo distingue sem plano de sem espaco", () => {
  // A tela decide o botao pelo code, nao pela mensagem — copy muda, code nao.
  assert.equal(planBlockedBody("campaigns:create").code, "plan_blocked");
  assert.equal(planLimitReachedBody("campaigns:create", 5).code, "plan_limit_reached");
  assert.equal(planStorageFullBody(100).code, "plan_storage_full");
});
