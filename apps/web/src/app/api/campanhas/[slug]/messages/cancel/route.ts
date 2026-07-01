import { cancelMessage } from "@/lib/messages-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/campanhas/[slug]/messages/cancel?id=xxx
export async function PATCH(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  const msg = await cancelMessage(id);
  if (!msg) return Response.json({ error: "Mensagem não encontrada." }, { status: 404 });
  return Response.json(msg);
}
