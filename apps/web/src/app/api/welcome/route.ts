import { getWelcome, setWelcome } from "@/lib/welcome-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/welcome — config das boas-vindas (a engine lê daqui).
export async function GET() {
  return Response.json(await getWelcome());
}

// POST /api/welcome — lojista liga/desliga e edita a mensagem.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const partial: { enabled?: boolean; message?: string } = {};
  if (typeof body.enabled === "boolean") partial.enabled = body.enabled;
  if (typeof body.message === "string") partial.message = body.message;
  const cfg = await setWelcome(partial);
  return Response.json(cfg, { status: 201 });
}
