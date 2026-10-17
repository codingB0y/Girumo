import { addOrder, removeOrder, listOrdersByTenant } from "@/lib/stores/orders";
import { getLeadAttribution } from "@/lib/stores/leads";
import { origemDoPedido } from "@/lib/stores/vendas";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { recordOrder } from "@/lib/orders/registrar";
import { parseValorDoPedido as parseOrderValue } from "@/lib/orders/valor-do-pedido";
import { ERRO_VENDA_DO_BLING } from "@/lib/vendas/tipos";

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
    // O lead tem que ser desta loja: sem a conferência o pedido gravava o
    // lead_id de outra. Id que não é uuid também não existe (o Postgres
    // responderia 22P02 e a rota, 500). Erro do banco aqui não é engolido:
    // sem saber de quem é o lead, o pedido não é gravado.
    const origin = leadId && UUID_RE.test(leadId) ? await getLeadAttribution(tenantId, leadId) : null;
    if (leadId && !origin) return Response.json({ error: "Contato não encontrado." }, { status: 400 });

    // Valor único, sem itens: continua no addOrder. Itens e autora são da venda
    // (/api/vendas); "Registrar pedido" do dono fica como está.
    const order = await recordOrder(tenantId, leadId && origin ? { id: leadId, ...origin } : null, (campaignId) =>
      addOrder(tenantId, {
        value,
        phone: b.phone ? String(b.phone) : undefined,
        leadId,
        group: b.group ? String(b.group) : undefined,
        campaignId,
      }),
    );
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
    // O Bling é a fonte da verdade: a venda dele só sai de `orders` pelo motor da integração.
    if ((await origemDoPedido(tenantId, id)) === "bling") {
      return Response.json({ error: ERRO_VENDA_DO_BLING }, { status: 409 });
    }
    if (!(await removeOrder(tenantId, id))) {
      return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
