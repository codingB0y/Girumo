import { requireInstagram } from "@/lib/ig/access";
import { zernioApiKey } from "@/lib/ig/segredos";
import { mensagemParaLojista } from "@/lib/ig/transport/erros";
import { ZernioError } from "@/lib/ig/transport/types";
import { createZernioTransport } from "@/lib/ig/transport/zernio";
import { assertPermission } from "@/lib/permissions";
import { getAccount, setAccountStatus } from "@/lib/stores/ig-accounts";
import { pauseLiveFlows } from "@/lib/stores/ig-flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/ig/account — apaga na Zernio, marca `disconnected` e pausa os fluxos no ar.
// Só dono e admin (mesma permissão de apagar campanha).
export async function DELETE(req: Request) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:delete");
    const conta = await getAccount(ctx.tenantId);
    if (!conta) return Response.json({ error: "Nenhuma conta conectada." }, { status: 404 });
    if (conta.provider_account_id) await createZernioTransport({ apiKey: zernioApiKey() }).deleteAccount(conta.provider_account_id);
    await setAccountStatus(ctx.tenantId, "disconnected", null);
    await pauseLiveFlows(ctx.tenantId);
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof ZernioError) return Response.json({ error: mensagemParaLojista(e) }, { status: e.status === 0 ? 503 : 502 });
    throw e;
  }
}
