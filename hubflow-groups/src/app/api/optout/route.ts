import { listOptOut, addOptOut, removeOptOut } from "@/lib/optout-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await listOptOut());
}

// DELETE /api/optout?id= — remove um número da lista de descadastro.
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  await removeOptOut(id);
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const phone = String(body.phone ?? "").trim();
  if (!phone) return Response.json({ error: "phone obrigatório." }, { status: 400 });
  const item = await addOptOut(phone, String(body.reason ?? ""));
  return Response.json(item, { status: 201 });
}
