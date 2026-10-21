"use client";

import { authenticatedFetch, getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MEDIA_BUCKET, resolveUploadLimitBytes, type MediaKind } from "@/lib/media-mime";

export type MediaUploadResult = { id: string; type: "image" | "video" | "audio" | "file" };

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error ?? fallback;
}

/**
 * Sobe um arquivo direto do browser pro Supabase Storage com o token de upload
 * assinado que `/api/media/prepare` emite (path e tenant resolvidos pelo
 * SERVIDOR — não pelo localStorage) e só então registra a metadata via
 * `/api/media/register`, um JSON pequeno. O token não depende da RLS de
 * `storage.objects`, que exclui a vendedora (spec 2026-10-07 §1, "RLS").
 *
 * As duas chamadas vão por `authenticatedFetch` (Bearer + `x-tenant-id`): quem
 * tem duas lojas sobe o arquivo na loja que está aberta. Com `fetch` puro o
 * servidor só via o cookie e caía na loja mais antiga — e o link da bio, que
 * confere se a foto é da loja no salvar, recusava (spec 2026-10-19 §4).
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

  const prepareRes = await authenticatedFetch("/api/media/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mime: file.type, kind }),
  });
  if (!prepareRes.ok) {
    throw new Error(await readErrorMessage(prepareRes, "Não foi possível preparar o envio."));
  }
  const { storagePath, token } = (await prepareRes.json()) as { storagePath: string; token: string };

  const { error: uploadError } = await getSupabaseBrowserClient()
    .storage.from(MEDIA_BUCKET)
    .uploadToSignedUrl(storagePath, token, file, { contentType: file.type });
  if (uploadError) {
    // Mensagem crua do SDK (RLS/rede) não é acionável pro usuário final —
    // ao contrário do erro de `/api/media/register`, que a rota já traduz.
    throw new Error("Não foi possível enviar o arquivo. Tente novamente.");
  }

  try {
    const registerRes = await authenticatedFetch("/api/media/register", {
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
