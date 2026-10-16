import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimitWith, type RateLimiter } from "./rate-limit";

const WINDOW = 60_000;

const upstashDown: RateLimiter = {
  limit: async () => {
    throw new Error("fetch failed: UPSTASH_REDIS_REST_URL unreachable");
  },
};

const upstashSaysBlocked: RateLimiter = { limit: async () => ({ success: false }) };
const upstashSaysAllowed: RateLimiter = { limit: async () => ({ success: true }) };

test("Upstash fora do ar degrada pro balde em memória em vez de propagar", async () => {
  // O caso que derruba o login: sem o catch, esta exceção sobe pelo middleware e
  // TODA request em /api/auth/login vira 500.
  await assert.doesNotReject(() => checkRateLimitWith(upstashDown, "down:1", 5, WINDOW));
  assert.equal(await checkRateLimitWith(upstashDown, "down:2", 5, WINDOW), false);
});

test("com o Upstash fora, o balde em memória ainda conta e bloqueia no teto", async () => {
  const id = "down:conta";
  assert.equal(await checkRateLimitWith(upstashDown, id, 2, WINDOW), false);
  assert.equal(await checkRateLimitWith(upstashDown, id, 2, WINDOW), false);
  // 3ª tentativa passa do teto de 2: degradado, mas não escancarado.
  assert.equal(await checkRateLimitWith(upstashDown, id, 2, WINDOW), true);
});

test("Upstash de pé manda no veredito e não toca no balde em memória", async () => {
  assert.equal(await checkRateLimitWith(upstashSaysBlocked, "up:1", 5, WINDOW), true);
  assert.equal(await checkRateLimitWith(upstashSaysAllowed, "up:1", 5, WINDOW), false);
});

test("sem Upstash configurado usa o balde em memória", async () => {
  const id = "sem-redis";
  assert.equal(await checkRateLimitWith(null, id, 1, WINDOW), false);
  assert.equal(await checkRateLimitWith(null, id, 1, WINDOW), true);
});

test("janela expirada zera o balde em memória", async () => {
  const id = "janela";
  assert.equal(await checkRateLimitWith(null, id, 1, 1), false);
  assert.equal(await checkRateLimitWith(null, id, 1, 1), true);
  await new Promise((r) => setTimeout(r, 5));
  // Passada a janela de 1ms, o balde recomeça do zero.
  assert.equal(await checkRateLimitWith(null, id, 1, 1), false);
});

test("teto degradado: Upstash fora do ar cai no balde em memória com o teto próprio, nem bloqueia tudo nem libera o normal", async (t) => {
  const erros = t.mock.method(console, "error", () => undefined);
  // O teto normal (5) daria N× 5 (um balde por instância): no /oauth/token do Bling, IP bloqueado por 60 min.
  // Bloquear tudo (falhar fechado) pararia todas as lojas quando o token vence. 1 por janela, por instância.
  assert.equal(await checkRateLimitWith(upstashDown, "degradado:1", 5, WINDOW, { maxSeFalhar: 1 }), false);
  assert.equal(await checkRateLimitWith(upstashDown, "degradado:1", 5, WINDOW, { maxSeFalhar: 1 }), true);
  assert.equal(await checkRateLimitWith(upstashDown, "degradado:outro", 5, WINDOW, { maxSeFalhar: 1 }), false);
  assert.match(String(erros.mock.calls[0]?.arguments[0]), /Upstash fora do ar: degradado:1 no balde em memória \(1 por janela\)/);
});

test("teto degradado: a resposta que a lib solta no timeout dela também vai para o balde; com o Upstash de pé, ele manda", async (t) => {
  t.mock.method(console, "error", () => undefined);
  const semResposta: RateLimiter = { limit: async () => ({ success: true, reason: "timeout" }) };
  assert.equal(await checkRateLimitWith(semResposta, "degradado:2", 5, WINDOW, { maxSeFalhar: 1 }), false);
  assert.equal(await checkRateLimitWith(semResposta, "degradado:2", 5, WINDOW, { maxSeFalhar: 1 }), true);
  // Sem a opção (o middleware, o login), o de sempre: passa.
  assert.equal(await checkRateLimitWith(semResposta, "degradado:3", 5, WINDOW), false);
  assert.equal(await checkRateLimitWith(semResposta, "degradado:3", 5, WINDOW), false);
  assert.equal(await checkRateLimitWith(upstashSaysAllowed, "degradado:4", 5, WINDOW, { maxSeFalhar: 1 }), false);
  assert.equal(await checkRateLimitWith(upstashSaysAllowed, "degradado:4", 5, WINDOW, { maxSeFalhar: 1 }), false);
  assert.equal(await checkRateLimitWith(upstashSaysBlocked, "degradado:5", 5, WINDOW, { maxSeFalhar: 1 }), true);
});

test("teto degradado sem Upstash configurado (dev): o balde em memória com o teto normal, como sempre", async () => {
  assert.equal(await checkRateLimitWith(null, "degradado:dev", 2, WINDOW, { maxSeFalhar: 1 }), false);
  assert.equal(await checkRateLimitWith(null, "degradado:dev", 2, WINDOW, { maxSeFalhar: 1 }), false);
  assert.equal(await checkRateLimitWith(null, "degradado:dev", 2, WINDOW, { maxSeFalhar: 1 }), true);
});
