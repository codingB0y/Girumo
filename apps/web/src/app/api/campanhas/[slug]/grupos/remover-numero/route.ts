import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { selectBulkTargets, type BulkTargetGroup } from "@/lib/groups/bulk-batch";
import { planRemovePhoneEverywhere, toRemoveParticipantJobs } from "@/lib/groups/duplicate-removal";
import { jidDigits } from "@/lib/evolution/admin-group";
import { enqueueBulkJobs } from "@/lib/stores/group-bulk-jobs";
import { listarParticipantesDosGrupos } from "@/lib/stores/group-participants";
import * as groupsStore from "@/lib/stores/groups";

/** `selectBulkTargets` garante `whatsapp_group_id` em runtime, mas o tipo não estreita sozinho. */
function comId(t: BulkTargetGroup): t is BulkTargetGroup & { whatsapp_group_id: string } {
  return Boolean(t.whatsapp_group_id);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/campanhas/[slug]/grupos/remover-numero
 * body { phone: string }
 *
 * Remove UM telefone de TODOS os grupos administrados desta campanha — sem
 * exceção (diferente do dedup, aqui não há "grupo que fica": o alvo já foi
 * escolhido explicitamente por quem digitou o telefone).
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

    const digitos = jidDigits(typeof body.phone === "string" ? body.phone : "");
    if (!digitos) {
      return Response.json({ error: "Informe um telefone válido." }, { status: 400 });
    }

    const groups = await groupsStore.listGroups(tenantId);
    const selection = selectBulkTargets(campaign.group_ids, groups);
    const targets = selection.targets.filter(comId);
    if (targets.length === 0) {
      return Response.json(
        {
          error:
            "Nenhum grupo desta campanha é administrado por um número conectado. Sem ser admin não dá para remover ninguém.",
        },
        { status: 400 },
      );
    }

    const groupIds = targets.map((t) => t.whatsapp_group_id);
    const rows = await listarParticipantesDosGrupos(tenantId, groupIds);
    const alvos = planRemovePhoneEverywhere(digitos, groupIds, rows);

    if (alvos.length === 0) {
      return Response.json(
        { error: "Esse número não foi encontrado em nenhum grupo desta campanha." },
        { status: 400 },
      );
    }

    const targetsByWhatsappId = new Map(targets.map((t) => [t.whatsapp_group_id, t]));
    const batchId = crypto.randomUUID();
    const total = await enqueueBulkJobs(
      tenantId,
      toRemoveParticipantJobs(
        [{ phone: digitos, groupIds: alvos }],
        targetsByWhatsappId,
        { tenantId, campaignGroupId: campaign.id, batchId },
      ),
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
    console.error("[api/campanhas/grupos/remover-numero] falha ao enfileirar:", error);
    return Response.json({ error: "Erro ao remover o número." }, { status: 500 });
  }
}
