import { listGroups, replaceGroups, updateGroup, type SyncGroupInput } from "@/lib/groups-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/groups — grupos reais sincronizados pela engine (inclui inviteUrl/capacity p/ lotação).
export async function GET() {
  return Response.json(await listGroups());
}

// POST /api/groups — sync da engine. Body: { groups: [{ whatsappGroupId, name, members, inviteUrl?, capacity? }] }
export async function POST(req: Request) {
  let body: { groups?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const raw = Array.isArray(body.groups) ? body.groups : [];
  const groups: SyncGroupInput[] = raw
    .map((g) => g as Record<string, unknown>)
    .filter((g) => g.whatsappGroupId && g.name)
    .map((g) => ({
      whatsappGroupId: String(g.whatsappGroupId),
      name: String(g.name),
      members: Number(g.members) || 0,
      inviteUrl: typeof g.inviteUrl === "string" && g.inviteUrl ? g.inviteUrl : undefined,
      capacity: Number(g.capacity) > 0 ? Number(g.capacity) : undefined,
    }));

  const saved = await replaceGroups(groups);
  return Response.json({ count: saved.length }, { status: 201 });
}

// PATCH /api/groups — painel define convite/capacidade de um grupo (necessário p/ o roteamento).
// Body: { id, inviteUrl?, capacity? }
export async function PATCH(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const id = String(b.id ?? "");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  const patch: { inviteUrl?: string; capacity?: number; displayNameBase?: string; displayNumber?: number } = {};
  if (typeof b.inviteUrl === "string") patch.inviteUrl = b.inviteUrl.trim();
  if (b.capacity !== undefined && Number(b.capacity) > 0) patch.capacity = Number(b.capacity);
  if (typeof b.displayNameBase === "string") patch.displayNameBase = b.displayNameBase.trim();
  if (b.displayNumber !== undefined) patch.displayNumber = Number(b.displayNumber) > 0 ? Number(b.displayNumber) : 0;
  const updated = await updateGroup(id, patch);
  if (!updated) return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
  return Response.json(updated);
}
