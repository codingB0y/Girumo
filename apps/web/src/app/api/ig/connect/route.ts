import { getAppUrl } from "@/lib/environment";
import { requireInstagram } from "@/lib/ig/access";
import { emitirEstado } from "@/lib/ig/connect/state";
import { zernioApiKey, zernioWebhookSecret } from "@/lib/ig/segredos";
import { mensagemParaLojista } from "@/lib/ig/transport/erros";
import { ZernioError } from "@/lib/ig/transport/types";
import { createZernioTransport } from "@/lib/ig/transport/zernio";
import { assertPermission } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ig/connect — devolve a URL da Zernio pra onde o navegador da loja vai.
// O perfil na Zernio leva o id da loja como nome (409 = já existe, reaproveita).
export async function POST(req: Request) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:edit");
    const zernio = createZernioTransport({ apiKey: zernioApiKey() });
    const profileId = await zernio.ensureProfile(ctx.tenantId);
    const estado = emitirEstado(ctx.tenantId, profileId, zernioWebhookSecret());
    const volta = `${getAppUrl()}/api/ig/connect/callback?state=${encodeURIComponent(estado)}`;
    const authUrl = await zernio.connectUrl(profileId, volta);
    return Response.json({ authUrl });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof ZernioError) return Response.json({ error: mensagemParaLojista(e) }, { status: e.status === 0 ? 503 : 502 });
    throw e;
  }
}
