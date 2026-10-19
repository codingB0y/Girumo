import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppClient } from "./app-client.js";
import { makeBulkDeps } from "./bulk-deps.js";
import type { EvolutionGroups } from "./evolution-groups.js";
import type { EvolutionSender } from "./evolution-sender.js";
import { makeGrowDeps } from "./grow-deps.js";
import { makeSendDeps } from "./send-loop.js";
import { MIN_REMAINING_SECONDS, SIGNED_URL_TTL_SECONDS, createSignedUrlCache } from "./signed-url-cache.js";

// Ids fictícios: o repositório é público.
const TENANT = "11111111-2222-4333-8444-555555555555";
const VIDEO = `${TENANT}/media/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.mp4`;
const FOTO = `${TENANT}/media/0b8c2d1e-4f5a-4b6c-8d7e-9f0a1b2c3d4e.jpg`;

/** Cada assinatura devolve um token novo — como o Storage de verdade. */
function assinador(resposta: (path: string) => string | null = (path) => path) {
  const chamadas: string[] = [];
  const sign = async (path: string, ttl: number): Promise<string | null> => {
    assert.equal(ttl, SIGNED_URL_TTL_SECONDS);
    chamadas.push(path);
    const base = resposta(path);
    return base === null ? null : `https://cdn.test/${base}?token=${chamadas.length}`;
  };
  return { sign, chamadas };
}

test("a mesma mídia reaproveita o link: o CDN só serve do cache o MESMO token", async () => {
  // 18/10: um vídeo para 36 grupos, assinado 36 vezes = 36 downloads da origem (644 MB).
  let agora = 0;
  const { sign, chamadas } = assinador();
  const signedUrl = createSignedUrlCache(sign, () => agora);

  const primeiro = await signedUrl(VIDEO);
  agora += 30 * 60_000; // meia hora depois, ainda no meio da postagem
  assert.equal(await signedUrl(VIDEO), primeiro);
  assert.deepEqual(chamadas, [VIDEO]);
});

test("assina de novo quando falta pouco para o link vencer", async () => {
  let agora = 0;
  const { sign, chamadas } = assinador();
  const signedUrl = createSignedUrlCache(sign, () => agora);
  const primeiro = await signedUrl(VIDEO);

  agora = (SIGNED_URL_TTL_SECONDS - MIN_REMAINING_SECONDS) * 1000;
  assert.equal(await signedUrl(VIDEO), primeiro, "no limite ainda vale");

  agora += 1;
  const segundo = await signedUrl(VIDEO);
  assert.notEqual(segundo, primeiro);
  assert.equal(chamadas.length, 2);
  assert.equal(await signedUrl(VIDEO), segundo, "o link novo passa a ser o reaproveitado");
});

test("mídias diferentes não dividem link", async () => {
  const { sign } = assinador();
  const signedUrl = createSignedUrlCache(sign, () => 0);
  assert.notEqual(await signedUrl(VIDEO), await signedUrl(FOTO));
});

test("falha ao assinar não fica guardada: o próximo envio tenta de novo", async () => {
  let falhar = true;
  const { sign, chamadas } = assinador((path) => (falhar ? null : path));
  const signedUrl = createSignedUrlCache(sign, () => 0);

  assert.equal(await signedUrl(VIDEO), null);
  falhar = false;
  assert.match((await signedUrl(VIDEO)) ?? "", /^https:\/\/cdn\.test\//);
  assert.equal(chamadas.length, 2);
});

/** Supabase falso: só o `storage.from(bucket).createSignedUrl` que os deps usam. */
function supabaseFalso() {
  const assinadas: string[] = [];
  const supabase = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) => {
          assert.equal(bucket, "uploads");
          assinadas.push(path);
          return { data: { signedUrl: `https://cdn.test/${path}?token=${assinadas.length}` }, error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { supabase, assinadas };
}

const mediaId = (path: string) => Buffer.from(path, "utf8").toString("base64url");

test("os três pontos que assinam mídia reaproveitam o link (envio, ações em massa, auto-grow)", async () => {
  const envio = supabaseFalso();
  const send = makeSendDeps(envio.supabase, {} as EvolutionSender);
  assert.equal(await send.signedMediaUrl(VIDEO), await send.signedMediaUrl(VIDEO));
  assert.equal(envio.assinadas.length, 1, "envio");

  const massa = supabaseFalso();
  const bulk = makeBulkDeps(massa.supabase, {} as AppClient, {} as EvolutionGroups);
  assert.equal(await bulk.signedMediaUrl(mediaId(FOTO), TENANT), await bulk.signedMediaUrl(mediaId(FOTO), TENANT));
  assert.equal(massa.assinadas.length, 1, "ações em massa");

  const grow = supabaseFalso();
  const auto = makeGrowDeps(grow.supabase, {} as AppClient, {} as EvolutionGroups);
  assert.equal(await auto.signedMediaUrl(mediaId(FOTO), TENANT), await auto.signedMediaUrl(mediaId(FOTO), TENANT));
  assert.equal(grow.assinadas.length, 1, "auto-grow");
});
