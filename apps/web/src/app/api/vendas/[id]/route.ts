import { z } from "zod";

import { deleteSale, hasSellerLimits, leadNames, origemDoPedido, replaceSaleItems, saleFromOrder } from "@/lib/stores/vendas";
import { MESSAGES, bodyErrorMessage, correctionBody, getSalesCaller, handleSalesErrors, itemsForRpc } from "@/lib/vendas/request";
import { ERRO_VENDA_DO_BLING } from "@/lib/vendas/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saleId = z.uuid();

// A RPC e o DELETE não olham `source`: a venda do Bling é barrada aqui, antes de qualquer escrita.
const bloqueadaPeloBling = () => Response.json({ error: ERRO_VENDA_DO_BLING }, { status: 409 });

// PATCH /api/vendas/[id] — troca os itens e recalcula o total. Vendedora: só a
// própria e até 24h (a RPC confere e lança `fora_da_janela`). Venda do Bling: 409.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleSalesErrors(async () => {
    const caller = await getSalesCaller(req);
    const { id } = await params;
    if (!saleId.safeParse(id).success) return Response.json({ error: MESSAGES.notFound }, { status: 404 });
    const body = correctionBody.safeParse(await req.json().catch(() => null));
    if (!body.success) return Response.json({ error: bodyErrorMessage(body.error) }, { status: 400 });
    const parsed = itemsForRpc(body.data.itens);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    if ((await origemDoPedido(caller.tenantId, id)) === "bling") return bloqueadaPeloBling();

    const order = await replaceSaleItems(caller, id, parsed.items);
    const names = await leadNames(caller.tenantId, [order.lead_id]);
    const client = order.lead_id ? (names.get(order.lead_id) ?? null) : null;
    return Response.json(saleFromOrder(order, parsed.items, client, caller, new Date()));
  });
}

// DELETE /api/vendas/[id] — vendedora: só a própria, até 24h; dono, admin e
// operador: qualquer venda da loja (o mesmo poder do DELETE /api/orders). Venda do Bling: 409.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleSalesErrors(async () => {
    const caller = await getSalesCaller(req);
    const { id } = await params;
    if (!saleId.safeParse(id).success) return Response.json({ error: MESSAGES.notFound }, { status: 404 });
    if ((await origemDoPedido(caller.tenantId, id)) === "bling") return bloqueadaPeloBling();
    if (await deleteSale(caller, id, new Date())) return Response.json({ ok: true });
    // Pros filtros de autora e prazo, "não existe" e "passou de 24h" dão no mesmo: não pode.
    return hasSellerLimits(caller.role)
      ? Response.json({ error: MESSAGES.window }, { status: 403 })
      : Response.json({ error: MESSAGES.notFound }, { status: 404 });
  });
}
