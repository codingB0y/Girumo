import { requireInstagram } from "@/lib/ig/access";
import { isUuid, patchBodySchema } from "@/lib/ig/flow/body";
import type { FlowDef } from "@/lib/ig/flow/types";
import { assertPermission } from "@/lib/permissions";
import { deleteFlow, getFlow, updateDraft } from "@/lib/stores/ig-flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const naoAchou = () => Response.json({ error: "Fluxo não encontrado." }, { status: 404 });

export async function GET(req: Request, { params }: Params) {
  try {
    const ctx = await requireInstagram(req);
    const { id } = await params;
    if (!isUuid(id)) return naoAchou();
    const flow = await getFlow(ctx.tenantId, id);
    return flow ? Response.json({ flow }) : naoAchou();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

// PATCH — só o rascunho (e o nome). Publicar é outra rota.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:edit");
    const { id } = await params;
    if (!isUuid(id)) return naoAchou();
    const parsed = patchBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Corpo inválido." }, { status: 400 });
    const flow = await updateDraft(ctx.tenantId, id, { name: parsed.data.name, draft: parsed.data.draft as FlowDef | undefined });
    return flow ? Response.json({ flow }) : naoAchou();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:delete");
    const { id } = await params;
    if (!isUuid(id)) return naoAchou();
    return (await deleteFlow(ctx.tenantId, id)) ? Response.json({ ok: true }) : naoAchou();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
