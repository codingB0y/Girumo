import { test } from "node:test";
import assert from "node:assert/strict";
import { liberarSyncWith, travarSyncWith, type LockStore } from "./sync-lock";

/** Redis de mentira com a semântica de `SET NX`: só grava se a chave não existe. */
function redisEmMemoria(): LockStore & { chaves: Map<string, string> } {
  const chaves = new Map<string, string>();
  return {
    chaves,
    set: async (key, value) => {
      if (chaves.has(key)) return null;
      chaves.set(key, value);
      return "OK";
    },
    del: async (key) => (chaves.delete(key) ? 1 : 0),
  };
}

const redisFora: LockStore = {
  set: async () => {
    throw new Error("fetch failed: UPSTASH_REDIS_REST_URL unreachable");
  },
  del: async () => {
    throw new Error("fetch failed");
  },
};

test("segundo sync do mesmo numero e recusado enquanto o primeiro roda", async () => {
  // O caso de 06/10: o auto-sync de /painel/conectar ainda rodava quando a
  // lojista clicou em Sincronizar, e o segundo pedido entrou na fila da
  // Evolution atras do primeiro ate estourar o tempo.
  const redis = redisEmMemoria();
  assert.equal(await travarSyncWith(redis, "inst-1"), true);
  assert.equal(await travarSyncWith(redis, "inst-1"), false);
});

test("numeros diferentes nao se bloqueiam", async () => {
  const redis = redisEmMemoria();
  assert.equal(await travarSyncWith(redis, "inst-1"), true);
  assert.equal(await travarSyncWith(redis, "inst-2"), true);
});

test("liberar a trava deixa o proximo sync passar", async () => {
  const redis = redisEmMemoria();
  await travarSyncWith(redis, "inst-1");
  await liberarSyncWith(redis, "inst-1");
  assert.equal(await travarSyncWith(redis, "inst-1"), true);
});

test("trava expira sozinha: a funcao morta pela Vercel nao segura o numero", async () => {
  let opcoes: { nx: true; ex: number } | undefined;
  const espiao: LockStore = {
    set: async (_k, _v, opts) => {
      opcoes = opts;
      return "OK";
    },
    del: async () => 1,
  };
  await travarSyncWith(espiao, "inst-1");
  assert.equal(opcoes?.nx, true);
  // Maior que o maxDuration da rota (60s): quem segura a trava morre antes dela.
  assert.ok((opcoes?.ex ?? 0) > 60);
});

test("Redis fora do ar nao impede o sync", async () => {
  // A trava e otimizacao, nao seguranca: sem ela o pior caso e o de hoje.
  assert.equal(await travarSyncWith(redisFora, "inst-1"), true);
  await assert.doesNotReject(() => liberarSyncWith(redisFora, "inst-1"));
});

test("sem Redis configurado o sync segue sem trava", async () => {
  assert.equal(await travarSyncWith(null, "inst-1"), true);
  await assert.doesNotReject(() => liberarSyncWith(null, "inst-1"));
});
