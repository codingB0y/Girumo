import { requireInstagram } from "@/lib/ig/access";
import { isUuid } from "@/lib/ig/flow/body";
import { keywordsInUse } from "@/lib/ig/flow/in-use";
import { validateFlow } from "@/lib/ig/flow/validate";
import { carregarCampanhas } from "@/lib/painel/inicio-carga";
import { assertPermission } from "@/lib/permissions";
import { getAccount } from "@/lib/stores/ig-accounts";
import { getFlow, listLiveFlows, publishFlow } from "@/lib/stores/ig-flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ig/flows/:id/publish — valida no servidor (a lista do painel é só
 * conforto) e copia o rascunho para o publicado. Contrato: falha de validação
 * é 409 `{ issues }`; qualquer outra falha é `{ error }` com o próprio status.
 * Na fase 1 nenhuma loja tem conta conectada, então a resposta é sempre 409 com
 * "Conecte o Instagram"; a fase 2 só acrescenta a conta.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:edit");
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    const flow = await getFlow(ctx.tenantId, id);
    if (!flow) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });

    const [account, campanhas, noAr] = await Promise.all([getAccount(ctx.tenantId), carregarCampanhas(ctx.tenantId), listLiveFlows(ctx.tenantId)]);
    const issues = validateFlow(flow.draft, {
      campaignSlugs: campanhas.map((c) => c.slug).filter((s): s is string => typeof s === "string"),
      accountConnected: account?.status === "active",
      keywordsInUse: keywordsInUse(noAr, flow.id),
    });
    if (issues.length > 0) return Response.json({ issues }, { status: 409 });

    // O mesmo grafo que foi validado é o que vai para `published`.
    const publicado = await publishFlow(ctx.tenantId, id, flow.draft, flow.version);
    if (!publicado) return Response.json({ error: "O fluxo mudou em outra aba. Recarregue e publique de novo." }, { status: 409 });
    return Response.json({ flow: publicado });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
