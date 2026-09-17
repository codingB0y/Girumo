import { prepareMediaUpload } from "@/lib/media-store";
import { resolveMediaAuth } from "@/lib/media-auth";
import { parseMediaKind } from "@/lib/media-mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Primeiro passo do upload direto: resolve auth+tenant no servidor (igual
 * `/api/media` sempre fez) e devolve ONDE o browser deve subir o arquivo no
 * Supabase Storage. Corpo é só JSON — nunca o binário — por isso o
 * `getActiveTenantId()` do localStorage não é necessário aqui: o tenant é o
 * mesmo resolvido por cookie de sessão de qualquer outra rota do painel.
 */
export async function POST(req: Request) {
  const auth = await resolveMediaAuth(req);
  if (auth instanceof Response) return auth;
  const { tenantId } = auth;

  let body: { mime?: unknown; kind?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Envio invalido." }, { status: 400 });
  }

  const { mime } = body;
  if (typeof mime !== "string" || !mime) {
    return Response.json({ error: "Tipo de arquivo ausente." }, { status: 400 });
  }

  const kind = parseMediaKind(body.kind);

  try {
    const prepared = prepareMediaUpload(mime, tenantId, kind);
    return Response.json(prepared, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Falha ao preparar upload.";
    return Response.json({ error: message }, { status: 500 });
  }
}
