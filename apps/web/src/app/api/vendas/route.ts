import { recordOrder } from "@/lib/orders/registrar";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { addLead } from "@/lib/stores/leads";
import {
  createSale,
  findLeadById,
  findLeadByPhones,
  isOptedOutAny,
  listMonthSales,
  saleFromOrder,
  type SaleLead,
} from "@/lib/stores/vendas";
import { MONTH_FORMAT, brasiliaMonth } from "@/lib/vendas/month";
import { MESSAGES, bodyErrorMessage, getSalesCaller, handleSalesErrors, itemsForRpc, saleBody } from "@/lib/vendas/request";
import { telefoneCanonico, variantesDoTelefone } from "@/lib/vendas/telefone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vendas por loja por minuto. */
const SALES_PER_MINUTE = 60;

// GET /api/vendas?mes=YYYY-MM — as vendas de quem chama no mês de Brasília
// (default: o corrente); dono, admin e operador também veem as do Bling da loja.
export async function GET(req: Request) {
  return handleSalesErrors(async () => {
    const caller = await getSalesCaller(req);
    const now = new Date();
    const month = new URL(req.url).searchParams.get("mes") || brasiliaMonth(now);
    if (!MONTH_FORMAT.test(month)) return Response.json({ error: MESSAGES.month }, { status: 400 });
    return Response.json(await listMonthSales(caller, month, now));
  });
}

// POST /api/vendas — registra uma venda com itens; a autora é quem chama.
export async function POST(req: Request) {
  return handleSalesErrors(async () => {
    const caller = await getSalesCaller(req);
    if (await checkRateLimit(`vendas-registro:${caller.tenantId}`, SALES_PER_MINUTE, 60_000)) {
      return Response.json({ error: MESSAGES.tooManySales }, { status: 429 });
    }
    const body = saleBody.safeParse(await req.json().catch(() => null));
    if (!body.success) return Response.json({ error: bodyErrorMessage(body.error) }, { status: 400 });
    const parsed = itemsForRpc(body.data.itens);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    const contact = await saleContact(caller.tenantId, body.data);
    if ("error" in contact) return Response.json({ error: contact.error }, { status: 400 });
    const { lead, phone } = contact;

    const order = await recordOrder(caller.tenantId, lead, (campaignId) =>
      createSale({ caller, leadId: lead?.id ?? null, phone, groupName: lead?.source_group_name ?? null, campaignId, items: parsed.items }),
    );
    return Response.json(saleFromOrder(order, parsed.items, lead?.name ?? null, caller, new Date()), { status: 201 });
  });
}

/**
 * O lead da venda e o telefone gravado no pedido. Com `leadId`, o lead tem que
 * ser desta loja. Sem, acha pelo número em qualquer formato ou cria um sem
 * grupo de origem. Número em opt-out: venda sem lead — quem pediu pra sair
 * não entra na base, nem por uma venda.
 */
async function saleContact(
  tenantId: string,
  body: { leadId?: string; telefone?: string; nome?: string },
): Promise<{ lead: SaleLead | null; phone: string } | { error: string }> {
  if (body.leadId) {
    const lead = await findLeadById(tenantId, body.leadId);
    // Contato sem telefone (regime @lid) não tem número para gravar no pedido.
    return lead?.phone ? { lead, phone: lead.phone } : { error: MESSAGES.contact };
  }
  const phones = variantesDoTelefone(body.telefone ?? "");
  const canonical = telefoneCanonico(body.telefone ?? "");
  if (!phones || !canonical) return { error: MESSAGES.phone };
  if (await isOptedOutAny(tenantId, phones)) return { lead: null, phone: canonical };
  const found = await findLeadByPhones(tenantId, phones);
  if (found) return { lead: found, phone: found.phone ?? canonical };
  return { lead: await addLead(tenantId, { phone: canonical, name: body.nome || undefined }), phone: canonical };
}
