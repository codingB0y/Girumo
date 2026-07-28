import { saveMedia, type MediaKind } from "@/lib/media-store";
import { getSessionAccountId } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertUploadLimit } from "@/lib/billing/entitlements";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveTenantId(authUserId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", authUserId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.tenant_id ?? null;
}

export async function POST(req: Request) {
  let authUserId: string | null = null;
  let tenantId: string | null = null;

  if (req.headers.get("authorization")) {
    try {
      const ctx = await getTenantContext(req);
      authUserId = ctx.authUserId;
      tenantId = ctx.tenantId;
    } catch (error) {
      if (error instanceof Response) return error;
      throw error;
    }
  } else {
    authUserId = await getSessionAccountId();
    if (!authUserId) return Response.json({ error: "Nao autenticado." }, { status: 401 });
    tenantId = await resolveTenantId(authUserId);
  }

  if (!tenantId) return Response.json({ error: "Tenant nao encontrado." }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Envio invalido." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Arquivo ausente." }, { status: 400 });

  // `kind` define a visibilidade: mídia de LP é servida publicamente por
  // /api/p/media/:id; qualquer outro valor cai no default privado.
  const rawKind = form.get("kind");
  const kind: MediaKind =
    rawKind === "lp-media" || rawKind === "lp-logo" ? rawKind : "media";

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");

  // Mídia de LP precisa ser imagem — a prova em vídeo é embed (YouTube/Vimeo),
  // não upload (escopo travado da v1).
  if ((kind === "lp-media" || kind === "lp-logo") && !isImage) {
    return Response.json({ error: "Envie uma imagem (PNG, JPEG ou WebP)." }, { status: 415 });
  }

  // Limites: logo 5MB · imagem de LP 10MB · vídeo 20MB · áudio 16MB ·
  // imagem comum 6MB · arquivo genérico 30MB (§7.4)
  const limit =
    kind === "lp-logo"
      ? 5_000_000
      : kind === "lp-media"
        ? 10_000_000
        : isVideo
          ? 20_000_000
          : isAudio
            ? 16_000_000
            : isImage
              ? 6_000_000
              : 30_000_000;
  if (file.size > limit) {
    const maxLabel = `${Math.round(limit / 1_000_000)}MB`;
    return Response.json({ error: `Arquivo grande demais (max ${maxLabel}).` }, { status: 413 });
  }

  try {
    await assertUploadLimit(tenantId, file.size);
    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveMedia(buffer, file.type, tenantId, authUserId, kind);
    return Response.json(saved, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Falha ao salvar midia.";
    return Response.json({ error: message }, { status: 500 });
  }
}
