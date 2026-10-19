import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppClient } from "./app-client.js";
import { makeBulkDeps } from "./bulk-deps.js";
import type { EvolutionGroups } from "./evolution-groups.js";
import type { EvolutionSender } from "./evolution-sender.js";
import { makeGrowDeps } from "./grow-deps.js";
import { makeSendDeps } from "./send-loop.js";
import { createSignedUrlCache } from "./signed-url-cache.js";

// Ids fictícios: o repositório é público.
const TENANT = "11111111-2222-4333-8444-555555555555";
const OUTRA_LOJA = "99999999-8888-4777-8666-555555555555";
const ARQUIVO_VIDEO = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.mp4";
const VIDEO = `${TENANT}/media/${ARQUIVO_VIDEO}`;
const FOTO = `${TENANT}/media/0b8c2d1e-4f5a-4b6c-8d7e-9f0a1b2c3d4e.jpg`;
const MINUTO = 60_000;

/** Cada assinatura devolve um token novo — como o Storage de verdade. */
function assinador(resposta: (path: string) => string | null = (path) => path) {
  const chamadas: string[] = [];
  const sign = async (path: string, ttlSeconds: number): Promise<string | null> => {
    assert.equal(ttlSeconds, 3600, "o link vale 1 hora");
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
  agora += 30 * MINUTO; // meia hora depois, ainda no meio da postagem
  assert.equal(await signedUrl(VIDEO), primeiro);
  assert.deepEqual(chamadas, [VIDEO]);
});

test("reassina quando faltam menos de 10 minutos para o link vencer", async () => {
  let agora = 0;
  const { sign, chamadas } = assinador();
  const signedUrl = createSignedUrlCache(sign, () => agora);
  const primeiro = await signedUrl(VIDEO);

  agora = 50 * MINUTO; // faltam exatamente 10 min
  assert.equal(await signedUrl(VIDEO), primeiro, "com 10 min de folga ainda vale");

  agora += 1;
  const segundo = await signedUrl(VIDEO);
  assert.notEqual(segundo, primeiro);
  assert.equal(chamadas.length, 2);
  assert.equal(await signedUrl(VIDEO), segundo, "o link novo passa a ser o reaproveitado");
});

test("mídias diferentes não dividem link, nem o mesmo arquivo em lojas diferentes", async () => {
  const { sign } = assinador();
  const signedUrl = createSignedUrlCache(sign, () => 0);
  const video = await signedUrl(VIDEO);
  assert.notEqual(video, await signedUrl(FOTO));
  assert.notEqual(video, await signedUrl(`${OUTRA_LOJA}/media/${ARQUIVO_VIDEO}`));
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

test("ações em massa e auto-grow checam a loja ANTES do cache", async () => {
  // Job forjado de outra loja com o mediaId desta: não pode levar o link que esta loja já aqueceu.
  const massa = supabaseFalso();
  const bulk = makeBulkDeps(massa.supabase, {} as AppClient, {} as EvolutionGroups);
  assert.ok(await bulk.signedMediaUrl(mediaId(FOTO), TENANT));
  assert.equal(await bulk.signedMediaUrl(mediaId(FOTO), OUTRA_LOJA), null, "ações em massa");

  const grow = supabaseFalso();
  const auto = makeGrowDeps(grow.supabase, {} as AppClient, {} as EvolutionGroups);
  assert.ok(await auto.signedMediaUrl(mediaId(FOTO), TENANT));
  assert.equal(await auto.signedMediaUrl(mediaId(FOTO), OUTRA_LOJA), null, "auto-grow");
});
