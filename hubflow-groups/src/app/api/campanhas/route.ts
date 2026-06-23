import { campanhasColl, ensureSlugs, uniqueCampanhaSlug, type Campanha } from "@/lib/campanhas-store";
import { listLinks } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/campanhas — lista as campanhas (escopos de grupos) já com o slug do link mestre.
export async function GET() {
  await ensureSlugs();
  return Response.json(await campanhasColl.list());
}

// POST /api/campanhas — cria uma campanha. { name, loja?, groupIds? }
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const name = String(b.name ?? "").trim();
  if (!name) return Response.json({ error: "Dê um nome à campanha." }, { status: 400 });
  // Slug do link mestre, único no namespace /r/ (campanhas + links).
  const [links, campanhas] = await Promise.all([listLinks(), campanhasColl.list()]);
  const taken = new Set<string>([...links.map((l) => l.slug), ...campanhas.map((c) => c.slug).filter(Boolean) as string[]]);
  const rec = await campanhasColl.create({
    name,
    loja: String(b.loja ?? "Minha loja").trim() || "Minha loja",
    groupIds: Array.isArray(b.groupIds) ? b.groupIds.map(String) : [],
    slug: uniqueCampanhaSlug(name, taken),
    createdAt: new Date().toISOString(),
  } as Omit<Campanha, "id">);
  return Response.json(rec, { status: 201 });
}

// PATCH /api/campanhas — edita { id, name?, loja?, groupIds? }
export async function PATCH(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const id = String(b.id ?? "");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  const patch: Partial<Campanha> = {};
  if (typeof b.name === "string") patch.name = b.name.trim();
  if (typeof b.loja === "string") patch.loja = b.loja.trim();
  if (Array.isArray(b.groupIds)) patch.groupIds = b.groupIds.map(String);
  if (typeof b.autoGrow === "boolean") patch.autoGrow = b.autoGrow;
  if (b.growTemplate && typeof b.growTemplate === "object") {
    const g = b.growTemplate as Record<string, unknown>;
    const subjectPattern = String(g.subjectPattern ?? "").trim();
    if (subjectPattern) {
      patch.growTemplate = {
        subjectPattern,
        desc: g.desc ? String(g.desc) : undefined,
        mediaId: g.mediaId ? String(g.mediaId) : undefined,
        announce: g.announce !== false, // default true
        memberAddMode: g.memberAddMode === "all_member_add" ? "all_member_add" : "admin_add",
      };
    }
  }
  const updated = await campanhasColl.update(id, patch);
  if (!updated) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
  return Response.json(updated);
}

// DELETE /api/campanhas?id=
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  await campanhasColl.remove(id);
  return Response.json({ ok: true });
}
