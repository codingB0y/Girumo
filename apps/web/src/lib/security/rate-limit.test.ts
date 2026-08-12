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
