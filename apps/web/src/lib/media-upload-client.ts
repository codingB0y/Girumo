"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MEDIA_BUCKET, resolveUploadLimitBytes, type MediaKind } from "@/lib/media-mime";

export type MediaUploadResult = { id: string; type: "image" | "video" | "audio" | "file" };

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error ?? fallback;
}

/**
 * Sobe um arquivo direto do browser pro Supabase Storage (a RLS de
 * `storage.objects` já libera INSERT pra quem é membro do tenant no path,
 * resolvido pelo SERVIDOR em `/api/media/prepare` — não pelo localStorage) e
 * só então registra a metadata via `/api/media/register`, um JSON pequeno.
 *
 * Existe porque uma Vercel Function tem um limite fixo de 4.5MB de corpo de
 * requisição (infra da plataforma, não contornável por código de app);
 * mandar o binário pela function fazia todo vídeo/áudio real falhar sempre,
 * "tentar de novo" incluso, porque não é uma falha transitória.
 */
export async function uploadMediaFile(file: File, kind: MediaKind = "media"): Promise<MediaUploadResult> {
  // Preflight local: barra cedo o caso comum (vídeo de celular claramente
  // grande demais) sem gastar minutos subindo um arquivo que o servidor só
  // ia rejeitar no fim de qualquer forma.
  const limit = resolveUploadLimitBytes(kind, file.type);
  if (file.size > limit) {
    throw new Error(`Arquivo grande demais (max ${Math.round(limit / 1_000_000)}MB).`);
  }

  const prepareRes = await fetch("/api/media/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mime: file.type, kind }),
  });
  if (!prepareRes.ok) {
    throw new Error(await readErrorMessage(prepareRes, "Não foi possível preparar o envio."));
  }
  const { storagePath } = (await prepareRes.json()) as { storagePath: string };

  const { error: uploadError } = await getSupabaseBrowserClient()
    .storage.from(MEDIA_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    // Mensagem crua do SDK (RLS/rede) não é acionável pro usuário final —
    // ao contrário do erro de `/api/media/register`, que a rota já traduz.
    throw new Error("Não foi possível enviar o arquivo. Tente novamente.");
  }

  try {
    const registerRes = await fetch("/api/media/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath, kind }),
    });
    if (!registerRes.ok) {
      throw new Error(await readErrorMessage(registerRes, "Não foi possível registrar a mídia."));
    }
    return (await registerRes.json()) as MediaUploadResult;
  } catch (error) {
    await getSupabaseBrowserClient().storage.from(MEDIA_BUCKET).remove([storagePath]).catch(() => {});
    throw error;
  }
}
