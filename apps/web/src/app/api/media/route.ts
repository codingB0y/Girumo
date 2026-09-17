import { saveMedia } from "@/lib/media-store";
import { assertUploadLimit } from "@/lib/billing/entitlements";
import { resolveMediaAuth } from "@/lib/media-auth";
import { resolveUploadLimitBytes, isLpMediaAllowed, parseMediaKind } from "@/lib/media-mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Multipart, direto pro handler — só serve arquivos pequenos. Uma Vercel
 * Function tem um limite fixo de 4.5MB de corpo de requisição (infra, não
 * contornável por código): qualquer caller que mandar um vídeo/áudio real por
 * aqui esbarra nesse teto do mesmo jeito que o bug original. O painel migrou
 * pro fluxo de duas fases (`uploadMediaFile()` → `/api/media/prepare` +
 * `/api/media/register`, upload direto ao Storage); esta rota continua de pé
 * só pra quem ainda manda multipart pequeno (ex.: engine server-to-server).
 */
export async function POST(req: Request) {
  const auth = await resolveMediaAuth(req);
  if (auth instanceof Response) return auth;
  const { authUserId, tenantId } = auth;

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
  const kind = parseMediaKind(form.get("kind"));

  if (!isLpMediaAllowed(kind, file.type)) {
    return Response.json({ error: "Envie uma imagem (PNG, JPEG ou WebP)." }, { status: 415 });
  }

  const limit = resolveUploadLimitBytes(kind, file.type);
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
