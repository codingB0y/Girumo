import { getReferralConfig, setReferralConfig } from "@/lib/stores/referrals";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REWARD = 120;
const MIN_GOAL = 1;
const MAX_GOAL = 1000;

function fail(e: unknown) {
  if (e instanceof Response) return e;
  return Response.json({ error: (e as Error).message }, { status: 500 });
}

// GET /api/referrals/config
export async function GET(req: Request) {
  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
    return Response.json(await getReferralConfig(tenantId));
  } catch (e) {
    return fail(e);
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

  if (b.reward !== undefined) {
    const reward = String(b.reward).trim().slice(0, MAX_REWARD);
    if (!reward) {
      return Response.json({ error: "Diga qual é a recompensa." }, { status: 400 });
    }
    partial.reward = reward;
  }

  if (b.goal !== undefined) {
    const goal = Math.floor(Number(b.goal));
    // Antes um `goal` inválido era descartado em silêncio: o painel mandava
    // "meta 0", recebia 201 e mostrava a meta antiga como se tivesse salvado.
    if (!Number.isFinite(goal) || goal < MIN_GOAL || goal > MAX_GOAL) {
      return Response.json(
        { error: `A meta precisa ser um número entre ${MIN_GOAL} e ${MAX_GOAL}.` },
        { status: 400 },
      );
    }
    partial.goal = goal;
  }

  if (partial.reward === undefined && partial.goal === undefined) {
    return Response.json({ error: "Nada para salvar." }, { status: 400 });
  }

  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
    return Response.json(await setReferralConfig(tenantId, partial));
  } catch (e) {
    return fail(e);
  }
}
