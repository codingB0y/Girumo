import { addOrder, removeOrder, countOrders, listOrdersByTenant } from "@/lib/stores/orders";
import { getLeadAttribution, updateLeadStatus } from "@/lib/stores/leads";
import { listCampaignGroups } from "@/lib/stores/campaign-groups";
import { resolveCampaignId } from "@/lib/campaign-attribution";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { parseValorDoPedido as parseOrderValue } from "@/lib/orders/valor-do-pedido";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  try {
    return Response.json(await listOrdersByTenant(tenantId));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
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

    let campaignId: string | undefined;
    if (leadId) {
      // O lead tem que ser desta loja: sem a conferência o pedido gravava o
      // lead_id de outra. Id que não é uuid também não existe (o Postgres
      // responderia 22P02 e a rota, 500). Erro do banco aqui não é engolido:
      // sem saber de quem é o lead, o pedido não é gravado.
      const lead = UUID_RE.test(leadId) ? await getLeadAttribution(tenantId, leadId) : null;
      if (!lead) return Response.json({ error: "Contato não encontrado." }, { status: 400 });

      // Atribuição de campanha: grupo de origem → campanha que o contém.
      // Best-effort — falha aqui não deve derrubar o registro do pedido.
      try {
        campaignId = resolveCampaignId(lead, await listCampaignGroups(tenantId)) ?? undefined;
      } catch (e) {
        // sem atribuição → cai em "sem origem"
        console.error(`[orders] atribuição de campanha falhou para ${tenantId}:`, (e as Error).message);
      }
    }

    const order = await addOrder(tenantId, {
      value,
      phone: b.phone ? String(b.phone) : undefined,
      leadId,
      group: b.group ? String(b.group) : undefined,
      campaignId,
    });
    if (leadId) {
      // Supabase, como o pedido (o ndjson legado nunca via esse lead). Lead não
      // encontrado não deve derrubar o pedido já criado.
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
  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  // Id que não é uuid não existe; sem isto o Postgres responde 22P02 e a rota daria 500.
  if (!UUID_RE.test(id)) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
  try {
    if (!(await removeOrder(tenantId, id))) {
      return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
