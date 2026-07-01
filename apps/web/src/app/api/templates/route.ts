import { listTemplates, createTemplate, deleteTemplate } from "@/lib/stores/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await listTemplates());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!body.name || !body.body) {
    return Response.json({ error: "name e body são obrigatórios." }, { status: 400 });
  }
  try {
    const template = await createTemplate({
      name: String(body.name),
      category: String(body.category ?? "drop"),
      body: String(body.body),
    });
    return Response.json(template, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  try {
    const ok = await deleteTemplate(id);
    return Response.json({ ok });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
