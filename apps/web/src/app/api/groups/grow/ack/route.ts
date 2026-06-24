import { ackGrow } from "@/lib/group-grow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/groups/grow/ack — a ENGINE reporta a criação de um grupo.
// body { id, status: "running"|"created"|"failed", whatsappGroupId?, members?, inviteLink?, error? }
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const id = b.id ? String(b.id) : "";
  const status = b.status as "running" | "created" | "failed";
  if (!id || !["running", "created", "failed"].includes(status)) {
    return Response.json({ error: "id e status válidos são obrigatórios." }, { status: 400 });
  }
  const job = await ackGrow({
    id,
    status,
    whatsappGroupId: b.whatsappGroupId ? String(b.whatsappGroupId) : undefined,
    members: Number(b.members) || 0,
    inviteLink: b.inviteLink ? String(b.inviteLink) : undefined,
    error: typeof b.error === "string" ? b.error : null,
  });
  if (!job) return Response.json({ error: "Job não encontrado." }, { status: 404 });
  return Response.json(job);
}
