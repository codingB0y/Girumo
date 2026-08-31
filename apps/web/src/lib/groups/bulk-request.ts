import "server-only";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { assertPermission } from "@/lib/permissions";
import * as campaignGroupsStore from "@/lib/stores/campaign-groups";

/**
 * Tenant + campanha para as rotas de ação em massa.
 *
 * `allowEngine: false` porque estas são rotas de painel: quem aplica foto em 91
 * grupos é uma pessoa com papel no tenant, não o worker. E `getRouteTenantContext`
 * (não `resolveSessionTenantId`) porque o painel manda Bearer além do cookie — um
 * helper só-cookie passaria em dev e daria 401 em produção.
 *
 * Lança `Response` em vez de devolver erro: é o padrão do repo, e deixa a rota
 * com um `catch (e) { if (e instanceof Response) return e }` só.
 */
export async function resolveBulkCampaign(
  req: Request,
  slug: string,
): Promise<{ tenantId: string; campaign: campaignGroupsStore.CampaignGroup }> {
  const ctx = await getRouteTenantContext(req, { allowEngine: false });
  if (!ctx.role) throw new Response("Sem permissão para esta ação.", { status: 403 });
  assertPermission(ctx.role, "campaign:edit");

  const campaign = await campaignGroupsStore.getCampaignGroupBySlug(ctx.tenantId, slug);
  if (!campaign) {
    throw Response.json({ error: "Campanha não encontrada." }, { status: 404 });
  }

  return { tenantId: ctx.tenantId, campaign };
}
