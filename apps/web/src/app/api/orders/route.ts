import { listOrders, addOrder, removeOrder } from "@/lib/orders-store";
import { updateLeadStatus } from "@/lib/leads-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/orders — lista pedidos registrados.
export async function GET() {
  return Response.json(await listOrders());
}

// POST /api/orders — registra um pedido. Body { value, phone?, leadId?, group? }
// Ao registrar, marca o lead como "comprou" (o pedido é a venda real).
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const value = Number(b.value);
  if (!value || value <= 0) {
    return Response.json({ error: "Informe o valor do pedido." }, { status: 400 });
  }
  const order = await addOrder({
    value,
    phone: b.phone ? String(b.phone) : undefined,
    leadId: b.leadId ? String(b.leadId) : undefined,
    group: b.group ? String(b.group) : undefined,
  });
  if (b.leadId) await updateLeadStatus(String(b.leadId), "comprou");
  return Response.json(order, { status: 201 });
}

// DELETE /api/orders?id= — remove um pedido.
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  const ok = await removeOrder(id);
  return Response.json({ ok });
}
