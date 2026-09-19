import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { selectBulkTargets, type BulkTargetGroup } from "@/lib/groups/bulk-batch";
import { findDuplicates, toRemoveParticipantJobs } from "@/lib/groups/duplicate-removal";
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
 * GET/POST /api/campanhas/[slug]/grupos/duplicados
 *
 * Duplicado é quem aparece em mais de um grupo ADMINISTRADO da campanha,
 * segundo `group_participants` (populada pelo sync — ver `duplicate-removal.ts`
 * pro porquê de não chamar a Evolution aqui). GET é preview, sem gravar nada:
 * mexer em várias pessoas de uma vez não pode ser a primeira coisa que
 * acontece num clique (mesmo espírito da confirmação de descrição vazia em
 * `identidade/route.ts`). POST relê e enfileira de verdade.
 */
async function carregarDuplicados(req: Request, slug: string) {
  const { tenantId, campaign } = await resolveBulkCampaign(req, slug);
  const groups = await groupsStore.listGroups(tenantId);
  const selection = selectBulkTargets(campaign.group_ids, groups);
  const targets = selection.targets.filter(comId);

  if (targets.length === 0) {
    return { tenantId, campaign, selection, targets, duplicados: [] as ReturnType<typeof findDuplicates> };
  }

  const groupIds = targets.map((t) => t.whatsapp_group_id);
  const rows = await listarParticipantesDosGrupos(tenantId, groupIds);
  return { tenantId, campaign, selection, targets, duplicados: findDuplicates(groupIds, rows) };
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { duplicados } = await carregarDuplicados(req, slug);
    const comTelefone = duplicados.filter((d) => d.phone);

    return Response.json({
      duplicates: comTelefone.map((d) => ({ phone: d.phone, groupCount: d.removeFromGroupIds.length + 1 })),
      semTelefone: duplicados.length - comTelefone.length,
      total: duplicados.length,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/duplicados] falha ao buscar:", error);
    return Response.json({ error: "Erro ao buscar duplicados." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { tenantId, campaign, selection, targets, duplicados } = await carregarDuplicados(req, slug);

    if (targets.length === 0) {
      return Response.json(
        {
          error:
            "Nenhum grupo desta campanha é administrado por um número conectado. Sem ser admin não dá para remover ninguém.",
        },
        { status: 400 },
      );
    }

    const comTelefone = duplicados.filter((d): d is typeof d & { phone: string } => Boolean(d.phone));
    if (comTelefone.length === 0) {
      return Response.json(
        { error: "Nenhum duplicado com telefone conhecido pra remover no momento." },
        { status: 400 },
      );
    }

    const targetsByWhatsappId = new Map(targets.map((t) => [t.whatsapp_group_id, t]));
    const batchId = crypto.randomUUID();
    const total = await enqueueBulkJobs(
      tenantId,
      toRemoveParticipantJobs(
        comTelefone.map((d) => ({ phone: d.phone, groupIds: d.removeFromGroupIds })),
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
    console.error("[api/campanhas/grupos/duplicados] falha ao enfileirar:", error);
    return Response.json({ error: "Erro ao remover duplicados." }, { status: 500 });
  }
}
