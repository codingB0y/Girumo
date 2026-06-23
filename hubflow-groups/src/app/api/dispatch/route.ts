import { enqueueDispatch } from "@/lib/dispatch-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/dispatch — lojista clicou "Enviar agora" numa oferta. body { id }
export async function POST(req: Request) {
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  const c = await enqueueDispatch(String(body.id));
  if (!c) return Response.json({ error: "Oferta não encontrada." }, { status: 404 });
  return Response.json(c, { status: 202 });
}
