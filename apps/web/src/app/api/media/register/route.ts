import { registerUploadedMedia } from "@/lib/media-store";
import { resolveMediaAuth } from "@/lib/media-auth";
import { parseMediaKind } from "@/lib/media-mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registra a metadata de um arquivo que `uploadMediaFile()` já subiu direto
 * pro Supabase Storage (bypassando o limite de 4.5MB de corpo de requisição
 * que uma Vercel Function impõe — ver comentário em `../route.ts`). Corpo é
 * só JSON pequeno, nunca o binário. `mime`/`size` são lidos do objeto real no
 * Storage dentro de `registerUploadedMedia`, não do que o client alega.
 */
export async function POST(req: Request) {
  const auth = await resolveMediaAuth(req);
  if (auth instanceof Response) return auth;
  const { authUserId, tenantId } = auth;

  let body: { storagePath?: unknown; kind?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Envio invalido." }, { status: 400 });
  }

  const { storagePath } = body;
  if (typeof storagePath !== "string" || !storagePath) {
    return Response.json({ error: "Caminho de mídia ausente." }, { status: 400 });
  }

  const kind = parseMediaKind(body.kind);

  try {
    const saved = await registerUploadedMedia(storagePath, tenantId, authUserId, kind);
    return Response.json(saved, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Falha ao registrar midia.";
    return Response.json({ error: message }, { status: 500 });
  }
}
