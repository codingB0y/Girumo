import { listActivity, upsertActivity, type ActivitySnapshot } from "@/lib/activity-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/activity — atividade dos grupos (lida pelo painel).
export async function GET() {
  return Response.json(await listActivity());
}

// POST /api/activity — a ENGINE reporta o snapshot de atividade. { groups: [...] }
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const groups = Array.isArray(b.groups) ? (b.groups as ActivitySnapshot[]) : [];
  await upsertActivity(groups);
  return Response.json({ ok: true, count: groups.length });
}
