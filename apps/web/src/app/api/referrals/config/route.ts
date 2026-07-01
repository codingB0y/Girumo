import { getReferralConfig, setReferralConfig } from "@/lib/stores/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getReferralConfig());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/referrals/config — { reward?, goal? }
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const partial: { reward?: string; goal?: number } = {};
  if (typeof b.reward === "string") partial.reward = b.reward;
  if (b.goal !== undefined && Number(b.goal) > 0) partial.goal = Math.floor(Number(b.goal));
  try {
    return Response.json(await setReferralConfig(partial), { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
