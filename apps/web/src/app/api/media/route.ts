import { saveMedia } from "@/lib/media-store";
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

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) return Response.json({ error: "Envie uma imagem ou video." }, { status: 400 });

  const limit = isVideo ? 20_000_000 : 6_000_000;
  if (file.size > limit) {
    return Response.json({ error: `Arquivo grande demais (max ${isVideo ? "20MB" : "6MB"}).` }, { status: 413 });
  }

  try {
    await assertUploadLimit(tenantId, file.size);
    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveMedia(buffer, file.type, tenantId, authUserId);
    return Response.json(saved, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Falha ao salvar midia.";
    return Response.json({ error: message }, { status: 500 });
  }
}
