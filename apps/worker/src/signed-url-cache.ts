/**
 * Um link assinado por mídia, reaproveitado enquanto vale.
 *
 * O CDN do Supabase (Smart CDN, plano Pro) guarda a resposta de link assinado,
 * mas cada token é uma entrada separada. Assinar de novo a cada envio fazia a
 * Evolution baixar o arquivo inteiro da origem em cada grupo: em 18/10, um vídeo
 * de 18 MB para 36 grupos deu 644 MB de saída. Com o mesmo link, só o primeiro
 * download vai à origem; os outros saem do cache, que tem cota própria e custa 1/3.
 *
 * Um cache por loop (envio, ações em massa, auto-grow) em cada processo do worker:
 * a mesma mídia é assinada uma vez por loop e de novo a cada ~50 min de uso.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Bucket privado onde o app guarda a mídia (ver apps/web/src/lib/media-store.ts). */
const MEDIA_BUCKET = "uploads";

/** Validade de cada link. Cobre uma postagem inteira na fila anti-ban. */
const SIGNED_URL_TTL_SECONDS = 3600;
/** Reassina quando falta menos que isto: a Evolution baixa no ato do POST, então basta folga para o download. */
const MIN_REMAINING_SECONDS = 600;

export type SignFn = (storagePath: string, ttlSeconds: number) => Promise<string | null>;
export type SignedUrlFn = (storagePath: string) => Promise<string | null>;

/** `now` é monotônico: acertar o relógio do servidor não faz um link velho parecer novo. */
export function createSignedUrlCache(sign: SignFn, now: () => number = () => performance.now()): SignedUrlFn {
  const links = new Map<string, { url: string; expiresAt: number }>();

  return async function signedUrl(storagePath) {
    const t = now();
    // Limpa os que já não servem: o mapa fica do tamanho das mídias da última hora.
    for (const [path, link] of links) {
      if (link.expiresAt - t < MIN_REMAINING_SECONDS * 1000) links.delete(path);
    }
    const cached = links.get(storagePath);
    if (cached) return cached.url;

    // Falha (null) não fica guardada: o próximo envio tenta assinar de novo.
    const url = await sign(storagePath, SIGNED_URL_TTL_SECONDS);
    if (url) links.set(storagePath, { url, expiresAt: t + SIGNED_URL_TTL_SECONDS * 1000 });
    return url;
  };
}

/**
 * O cache ligado ao Storage. Erro vira `null` (quem chama trata como mídia
 * indisponível) e vai para `onError`, que loga com o prefixo de cada loop.
 */
export function storageSignedUrls(supabase: SupabaseClient, onError: (message: string) => void): SignedUrlFn {
  return createSignedUrlCache(async (storagePath, ttlSeconds) => {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(storagePath, ttlSeconds);
    if (error) {
      onError(error.message);
      return null;
    }
    return data?.signedUrl ?? null;
  });
}
