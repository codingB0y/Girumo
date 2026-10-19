import { COMUNIDADE_NATIVA_MENSAGEM } from "@/lib/communities/validation";
import { buildSubjectJobs } from "@/lib/groups/bulk-batch";
import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { completarOrdem, padronizarGrowTemplate, planejarRenomes, validarBase } from "@/lib/groups/padronizar";
import { listCampaignGroupStates } from "@/lib/stores/campaign-group-states";
import * as campaignGroupsStore from "@/lib/stores/campaign-groups";
import { enqueueBulkJobs } from "@/lib/stores/group-bulk-jobs";
import { listInFlightCampaignIds } from "@/lib/stores/group-grow-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LISTA_MUDOU = "A lista de grupos mudou. Recarregue a página.";
const GRUPO_NASCENDO =
  "Um grupo novo desta campanha está sendo criado agora. Espere ele aparecer e tente de novo.";

function listaDeTexto(valor: unknown): string[] | null {
  return Array.isArray(valor) && valor.every((item) => typeof item === "string") ? valor : null;
}

/**
 * POST /api/campanhas/[slug]/grupos/padronizar
 * body { base, ordem: string[], esperado: string[] } → 201 { batchId, renomes }
 *
 * "Padronizar nomes e sequência" (spec 2026-10-10 §6.7, D9). Salva a ordem do
 * link na hora (`reordenar_campanha`), enfileira os renomes num lote só pela
 * fila anti-ban das ações em massa e grava o molde "<base> {n}" + `padronizadoEm`
 * no `grow_template`, para o auto-grow criar o próximo como "<base> <n+1>".
 *
 * `esperado` é a lista que a tela estava vendo. Se o conjunto mudou entre o
 * carregamento e o clique (o auto-grow anexou um grupo), `reordenar_campanha`
 * devolve false e a resposta é 409 — nada enfileirado, nada gravado.
 *
 * O nome no banco (`groups.name`) só muda no ack `done` de cada renome
 * (`ackBulk`): renome que falha deixa o grupo com o nome antigo nos dois lados.
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
    // `null`, número, texto e lista são JSON válido mas não têm `.base`: sem esta
    // guarda estouram TypeError no acesso abaixo e viram 500.
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return Response.json({ error: "Envie um objeto JSON com base, ordem e esperado." }, { status: 400 });
    }

    const base = validarBase(body.base);
    if (!base.ok) return Response.json({ error: base.error }, { status: 400 });

    const ordem = listaDeTexto(body.ordem);
    const esperado = listaDeTexto(body.esperado);
    if (!ordem || !esperado) {
      return Response.json({ error: "Envie a ordem dos grupos e a lista que você estava vendo." }, { status: 400 });
    }
    const completa = completarOrdem(ordem, esperado);
    if (!completa.ok) return Response.json({ error: completa.error }, { status: 400 });

    // A gaveta espelho de comunidade nativa tem `group_ids` regravado a cada sync.
    if (campaign.whatsapp_community_jid) {
      return Response.json({ error: COMUNIDADE_NATIVA_MENSAGEM }, { status: 409 });
    }

    // Job de criação na fila já carrega o nome resolvido com o molde antigo: o
    // grupo nasceria fora do padrão, no fim da sequência recém-salva.
    // ponytail: ainda sobra a janela entre esta leitura e o `reordenar_campanha`;
    // se o grupo for anexado nela, o próprio reordenar devolve false (409).
    if ((await listInFlightCampaignIds(tenantId)).has(campaign.id)) {
      return Response.json({ error: GRUPO_NASCENDO }, { status: 409 });
    }

    const [estados, conflitos] = await Promise.all([
      listCampaignGroupStates(tenantId, campaign.id),
      campaignGroupsStore.listarConflitos(tenantId),
    ]);

    const salvou = await campaignGroupsStore.reordenarCampanha(tenantId, campaign.id, esperado, completa.ordem);
    if (!salvou) return Response.json({ error: LISTA_MUDOU }, { status: 409 });

    const renomes = planejarRenomes({
      ordem: completa.ordem,
      base: base.base,
      estados,
      conflitos: new Set(conflitos.map((c) => c.whatsappGroupId)),
    });
    const batchId = crypto.randomUUID();
    const enfileirados = await enqueueBulkJobs(
      tenantId,
      buildSubjectJobs({ tenantId, campaignGroupId: campaign.id, batchId, renomes }),
    );

    await campaignGroupsStore.updateCampaignGroup(tenantId, campaign.id, {
      grow_template: padronizarGrowTemplate(campaign.grow_template, base.base, new Date().toISOString()),
    });

    return Response.json({ batchId, renomes: enfileirados }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/grupos/padronizar] falha ao padronizar:", error);
    return Response.json({ error: "Erro ao padronizar os grupos." }, { status: 500 });
  }
}
