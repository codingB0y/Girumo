import { tenantGrantsPlan } from "@/lib/billing/entitlements";
import { claimGrow, evaluateAutoGrow } from "@/lib/group-grow-store";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/groups/grow/pending — a ENGINE reivindica os grupos a criar.
// Antes do claim, avalia o auto-grow (proativo a 90%) e enfileira o que precisa.
export async function POST(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
  // Loja sem plano (cancelou, inadimplente, boleto vencido) não cria grupo
  // sozinha: o auto-grow ligado enquanto o plano valia seguia criando job a cada
  // ciclo do worker. Nem enfileira nem reivindica; o que ficou na fila volta a
  // andar se ela reassinar.
  if (USE_SUPABASE && !(await tenantGrantsPlan(tenantId))) return Response.json([]);
  await evaluateAutoGrow(tenantId);
  return Response.json(await claimGrow(tenantId));
}
