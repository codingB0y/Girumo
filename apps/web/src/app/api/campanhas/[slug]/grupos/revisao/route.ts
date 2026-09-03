import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { buildBulkJobs, selectBulkTargets } from "@/lib/groups/bulk-batch";
import { enqueueBulkJobs } from "@/lib/stores/group-bulk-jobs";
import { etaRevisaoMin, resumoRevisao } from "@/lib/groups/invite-review";
import * as groupsStore from "@/lib/stores/groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Revisão dos links de convite da campanha.
 *
 * Irmã de `estado` e `identidade`, com uma diferença que importa: `check_invite`
 * LÊ em vez de escrever, e corre no ritmo de D7 (1 leitura por minuto por
 * tenant, travado dentro de `claim_bulk_jobs`). Por isso o POST devolve o ETA
 * calculado com esse ritmo — prometer o ritmo do lote de identidade (~15/min)
 * diria "6 minutos" para uma revisão de 91 grupos que leva uma hora e meia.
 */

/** Só os grupos da campanha, para o resumo não misturar grupo de outra. */
function daCampanha(groups: readonly groupsStore.Group[], groupIds: readonly string[]) {
  const alvo = new Set(groupIds);
  return groups.filter((g) => g.whatsapp_group_id && alvo.has(g.whatsapp_group_id));
}

/** GET — o que a tela mostra: contagens da última revisão e quando foi. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { tenantId, campaign } = await resolveBulkCampaign(req, slug);
    const groups = await groupsStore.listGroups(tenantId);
    const selection = selectBulkTargets(campaign.group_ids, groups);

    return Response.json({
      ...resumoRevisao(daCampanha(groups, campaign.group_ids)),
      // Quantos seriam revisados agora: só onde somos admin, que é o mesmo
      // recorte do lote. O ETA fica honesto porque conta o alvo real.
      revisaveis: selection.targets.length,
      etaMin: etaRevisaoMin(selection.targets.length),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/revisao] falha ao resumir:", error);
    return Response.json({ error: "Erro ao ler a revisão dos links." }, { status: 500 });
  }
}

/** POST — enfileira a revisão. Sem corpo: revisar é uma coisa só. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { tenantId, campaign } = await resolveBulkCampaign(req, slug);

    const groups = await groupsStore.listGroups(tenantId);
    const selection = selectBulkTargets(campaign.group_ids, groups);

    if (selection.targets.length === 0) {
      return Response.json(
        {
          error:
            "Nenhum grupo desta campanha é administrado por um número conectado. Sem ser admin não dá para ler o convite.",
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
        action: "check_invite",
        groups: selection.targets,
      }),
    );

    return Response.json(
      {
        batchId,
        total,
        etaMin: etaRevisaoMin(total),
        skipped: { semAdmin: selection.skippedNoAdmin, semId: selection.skippedNoId },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/revisao] falha ao enfileirar:", error);
    return Response.json({ error: "Erro ao revisar os links." }, { status: 500 });
  }
}
