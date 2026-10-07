import { z } from "zod";
import { requireInstagram } from "@/lib/ig/access";
import { isUuid } from "@/lib/ig/flow/body";
import { assertPermission } from "@/lib/permissions";
import { getAccount } from "@/lib/stores/ig-accounts";
import { getFlow, setFlowStatus } from "@/lib/stores/ig-flows";
import { stopActiveRuns } from "@/lib/stores/ig-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corpoSchema = z.strictObject({ status: z.enum(["live", "paused"]) });

// POST /api/ig/flows/[id]/status — o interruptor "No ar". Pausar para os runs em andamento;
// retomar exige a conta conectada.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:edit");
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Corpo inválido." }, { status: 400 });
    const flow = await getFlow(ctx.tenantId, id);
    if (!flow) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    if (!flow.published) return Response.json({ error: "Publique o fluxo antes de ligar." }, { status: 409 });
    if (parsed.data.status === "live") {
      const conta = await getAccount(ctx.tenantId);
      if (conta?.status !== "active") return Response.json({ error: "Conecte o Instagram pra pôr no ar." }, { status: 409 });
    }
    const atualizado = await setFlowStatus(ctx.tenantId, id, parsed.data.status);
    if (!atualizado) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    if (parsed.data.status === "paused") await stopActiveRuns(ctx.tenantId, id);
    return Response.json({ flow: atualizado });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
