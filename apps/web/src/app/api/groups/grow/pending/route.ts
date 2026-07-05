import { claimGrow, evaluateAutoGrow } from "@/lib/group-grow-store";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/groups/grow/pending — a ENGINE reivindica os grupos a criar.
// Antes do claim, avalia o auto-grow (proativo a 90%) e enfileira o que precisa.
export async function POST(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
  await evaluateAutoGrow(tenantId);
  return Response.json(await claimGrow(tenantId));
}
