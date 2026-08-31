import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { buildBulkJobs, selectBulkTargets } from "@/lib/groups/bulk-batch";
import { enqueueBulkJobs } from "@/lib/stores/group-bulk-jobs";
import * as groupsStore from "@/lib/stores/groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/campanhas/[slug]/grupos/estado
 * body { action: "open" | "close" }
 *
 * "Abrir" e "fechar" são sobre quem pode MANDAR mensagem no grupo
 * (`not_announcement` / `announcement`). Não mexem no link de convite nem em
 * quem pode editar os dados do grupo.
 *
 * O reflexo em `groups.send_state` acontece no `ack` do worker, não aqui: a
 * tela só deve dizer "fechado" depois que o WhatsApp aceitou.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { tenantId, campaign } = await resolveBulkCampaign(req, slug);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const action = body.action;
    if (action !== "open" && action !== "close") {
      return Response.json({ error: 'Ação deve ser "open" ou "close".' }, { status: 400 });
    }

    const groups = await groupsStore.listGroups(tenantId);
    const selection = selectBulkTargets(campaign.group_ids, groups);

    if (selection.targets.length === 0) {
      return Response.json(
        {
          error:
            "Nenhum grupo desta campanha é administrado por um número conectado. Sem ser admin não dá para abrir nem fechar.",
        },
        { status: 400 },
      );
    }

    const batchId = crypto.randomUUID();
    const total = await enqueueBulkJobs(
      tenantId,
      buildBulkJobs({
        tenantId,
        campaignGroupId: campaign.id,
        batchId,
        action,
        groups: selection.targets,
      }),
    );

    return Response.json(
      {
        batchId,
        total,
        skipped: { semAdmin: selection.skippedNoAdmin, semId: selection.skippedNoId },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/estado] falha ao enfileirar:", error);
    return Response.json({ error: "Erro ao abrir ou fechar os grupos." }, { status: 500 });
  }
}
