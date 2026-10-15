import "server-only";

import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { resolveCampaignId, type LeadAttribution } from "@/lib/campaign-attribution";
import { listCampaignGroups } from "@/lib/stores/campaign-groups";
import { updateLeadStatus } from "@/lib/stores/leads";
import { hasExactlyOneOrder } from "@/lib/stores/orders";

/** O lead do pedido, já conferido no tenant, com a origem que decide a campanha. */
export type OrderLead = LeadAttribution & { id: string };

/**
 * Tudo o que acontece em volta de gravar um pedido, igual para "Registrar
 * pedido" (POST /api/orders, valor único) e "Registrar venda" (POST
 * /api/vendas, com itens): a campanha sai do grupo de origem do lead, o lead
 * vira "comprou" e o primeiro pedido da loja marca `first_order`.
 *
 * Quem grava é o chamador (`write`), porque os dois gravam diferente — o
 * `addOrder` e a RPC `create_order_with_items`. Só a gravação derruba o
 * registro: campanha, status e marco são best-effort, como sempre foram.
 *
 * `throwOnCampaignError`: a falha da BUSCA de campanha sobe antes de gravar (sem
 * grupo que case continua sem campanha). Para quem tenta de novo depois, como a
 * venda do Bling: criada sem campanha, ela nunca mais ganharia uma.
 */
export async function recordOrder<O extends { id: string }>(
  tenantId: string,
  lead: OrderLead | null,
  write: (campaignId: string | undefined) => Promise<O>,
  options: { throwOnCampaignError?: boolean } = {},
): Promise<O> {
  const campaignId = lead ? await campaignFromLead(tenantId, lead, options.throwOnCampaignError === true) : undefined;
  const order = await write(campaignId);
  if (lead) {
    // Lead apagado entre a conferência e aqui não derruba o pedido já criado.
    await updateLeadStatus(tenantId, lead.id, "comprou").catch((e) => {
      console.error("[orders] status do lead falhou", tenantId, (e as Error).message);
      return null;
    });
  }
  await markFirstOrder(tenantId, order.id);
  return order;
}

/** Campanha cujo grupo contém a origem do lead. Sem match: sem origem. Com erro: sem origem, ou sobe (`strict`). */
async function campaignFromLead(tenantId: string, lead: LeadAttribution, strict: boolean): Promise<string | undefined> {
  try {
    return resolveCampaignId(lead, await listCampaignGroups(tenantId)) ?? undefined;
  } catch (e) {
    console.error(`[orders] atribuição de campanha falhou para ${tenantId}:`, (e as Error).message);
    if (strict) throw e;
    return undefined;
  }
}

/** Marco de ativação: depois do insert, a loja com exatamente um pedido acabou de fazer o primeiro. */
async function markFirstOrder(tenantId: string, orderId: string): Promise<void> {
  try {
    if (await hasExactlyOneOrder(tenantId)) {
      void trackFunnelEvent({ tenantId, userId: null, event: "first_order", onlyFirst: true, metadata: { orderId } });
    }
  } catch (e) {
    console.error(`[orders] funnel tracking falhou para ${tenantId}:`, (e as Error).message);
  }
}
