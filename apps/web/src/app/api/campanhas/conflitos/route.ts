import { getTenantContext } from "@/lib/supabase/tenant-context";
import { assertPermission } from "@/lib/permissions";
import { lerEscolha, planejarEscolha } from "@/lib/campaigns/conflito-grupo";
import { listCampaignGroups, listarConflitos, removeGroupId } from "@/lib/stores/campaign-groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/campanhas/conflitos → { conflitos }
 *
 * Grupos que estão em mais de uma campanha da loja (spec 2026-10-10-postar-por-grupo §6.6, D4).
 * São todos de antes do trigger `campaign_groups_grupo_exclusivo`, que recusa conflito novo.
 * Nada sai sozinho: o lojista escolhe no POST.
 */
export async function GET(req: Request) {
  try {
    const { tenantId } = await getTenantContext(req);
    return Response.json({ conflitos: await listarConflitos(tenantId) });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/conflitos] falha ao listar:", error);
    return Response.json({ error: "Não deu pra carregar os grupos em duas campanhas." }, { status: 500 });
  }
}

/**
 * POST /api/campanhas/conflitos — body { jid, ficaEm } → { ok: true }
 *
 * O grupo fica em `ficaEm` e sai de toda outra campanha da loja que o tem, pela RPC atômica
 * `campaign_group_remove_group_id` (remover nunca é recusado pelo trigger). Recusa (409) quando
 * `ficaEm` não tem mais o grupo — senão ele ficaria sem campanha nenhuma.
 */
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "campaign:edit");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }
    const escolha = lerEscolha(body);
    if (!escolha.ok) return Response.json({ error: escolha.error }, { status: 400 });

    const plano = planejarEscolha(await listCampaignGroups(ctx.tenantId), escolha);
    if (!plano.ok) return Response.json({ error: plano.error }, { status: plano.status });

    for (const campanhaId of plano.tirarDe) {
      await removeGroupId(ctx.tenantId, campanhaId, escolha.jid);
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/campanhas/conflitos] falha ao salvar a escolha:", error);
    return Response.json({ error: "Não deu pra salvar a escolha." }, { status: 500 });
  }
}
