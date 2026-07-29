import { listOrders, addOrder, removeOrder, countOrders } from "@/lib/stores/orders";
import { updateLeadStatus } from "@/lib/leads-store";
import { getLeadSourceCampaign } from "@/lib/stores/leads";
import { listCampaignGroups } from "@/lib/stores/campaign-groups";
import { matchCampaignId } from "@/lib/campaign-attribution";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await listOrders());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Aceita valor com vírgula decimal (e ponto de milhar): "149,90" → 149.90.
function parseOrderValue(raw: unknown): number {
  if (typeof raw === "number") return raw;
  const str = String(raw ?? "").trim();
  if (!str) return NaN;
  const normalized = str.includes(",") ? str.replace(/\./g, "").replace(",", ".") : str;
  return Number(normalized);
}

export async function POST(req: Request) {
  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const value = parseOrderValue(b.value);
  if (!value || value <= 0) {
    return Response.json({ error: "Informe o valor do pedido." }, { status: 400 });
  }
  try {
    const leadId = b.leadId ? String(b.leadId) : undefined;

    // Atribuição de campanha: infere do lead (source_campaign → id da campanha).
    // Best-effort — falha aqui não deve derrubar o registro do pedido.
    let campaignId: string | undefined;
    if (leadId) {
      try {
        const source = await getLeadSourceCampaign(tenantId, leadId);
        if (source) {
          const campaigns = await listCampaignGroups(tenantId);
          campaignId = matchCampaignId(source, campaigns.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))) ?? undefined;
        }
      } catch {
        // sem atribuição → cai em "sem origem"
      }
    }

    const order = await addOrder({
      value,
      phone: b.phone ? String(b.phone) : undefined,
      leadId,
      group: b.group ? String(b.group) : undefined,
      campaignId,
    });
    if (leadId) {
      // Fonte da verdade no server; lead não encontrado não deve derrubar o pedido já criado.
      await updateLeadStatus(tenantId, leadId, "comprou").catch(() => null);
    }

    // Marco de ativação: 1º pedido. Contagem pós-insert; ===1 = primeiro. Best-effort.
    try {
      if ((await countOrders(tenantId)) === 1) {
        void trackFunnelEvent({ tenantId, userId: null, event: "first_order", onlyFirst: true, metadata: { orderId: order.id } });
      }
    } catch (e) {
      console.error(`[orders] funnel tracking falhou para ${tenantId}:`, (e as Error).message);
    }

    return Response.json(order, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  try {
    const ok = await removeOrder(id);
    return Response.json({ ok });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
