import { getReferralConfig, setReferralConfig } from "@/lib/referrals-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getReferralConfig());
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
  return Response.json(await setReferralConfig(partial), { status: 201 });
}
