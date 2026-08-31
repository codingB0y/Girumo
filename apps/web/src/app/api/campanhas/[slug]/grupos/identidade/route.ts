import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { mergeGrowIdentity, planIdentityJobs, selectBulkTargets } from "@/lib/groups/bulk-batch";
import { enqueueBulkJobs } from "@/lib/stores/group-bulk-jobs";
import * as campaignGroupsStore from "@/lib/stores/campaign-groups";
import * as groupsStore from "@/lib/stores/groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/campanhas/[slug]/grupos/identidade
 * body { description?: string, mediaId?: string, confirmClear?: boolean }
 *
 * Enfileira foto e/ou descrição para todos os grupos ADMINISTRADOS da campanha,
 * sob um `batch_id` só, e grava a identidade no `grow_template` — sem isso o
 * grupo 92, criado pelo auto-grow, nasceria fora do padrão que o lojista acabou
 * de aplicar.
 *
 * A tela não manda a lista de grupos: ela nem conhece o UUID de `groups` (o
 * `id` que /api/groups devolve é o whatsapp_group_id). Quem resolve o alvo é o
 * servidor, a partir de `campaign_groups.group_ids`.
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

    // `typeof` e não `??`: string vazia é carga legítima (apagar a descrição) e
    // um default a engoliria, transformando "não mandei descrição" em "apague".
    const description = typeof body.description === "string" ? body.description : undefined;
    const mediaId = typeof body.mediaId === "string" && body.mediaId ? body.mediaId : undefined;

    const groups = await groupsStore.listGroups(tenantId);
    const selection = selectBulkTargets(campaign.group_ids, groups);

    const batchId = crypto.randomUUID();
    let jobs;
    try {
      jobs = planIdentityJobs({
        tenantId,
        campaignGroupId: campaign.id,
        batchId,
        targets: selection.targets,
        description,
        mediaId,
        confirmClear: body.confirmClear === true,
      });
    } catch (validation) {
      const message = validation instanceof Error ? validation.message : "Dados inválidos.";
      return Response.json({ error: message }, { status: 400 });
    }

    if (selection.targets.length === 0) {
      return Response.json(
        {
          error:
            "Nenhum grupo desta campanha é administrado por um número conectado. Sem ser admin não dá para trocar foto nem descrição.",
        },
        { status: 400 },
      );
    }

    const total = await enqueueBulkJobs(tenantId, jobs);

    // A herança é gravada mesmo que o enqueue tenha virado no-op por lote
    // repetido: o padrão da campanha é o que o lojista pediu, não o resultado da
    // deduplicação da fila.
    await campaignGroupsStore.updateCampaignGroup(tenantId, campaign.id, {
      grow_template: mergeGrowIdentity(campaign.grow_template, { description, mediaId }),
    });

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
    console.error("[api/campanhas/grupos/identidade] falha ao enfileirar:", error);
    return Response.json({ error: "Erro ao aplicar a identidade nos grupos." }, { status: 500 });
  }
}
