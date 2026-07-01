import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/broadcasts";
import { enqueueDispatch } from "@/lib/dispatch-store";
import { getSessionAccountId } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveTenantId(): Promise<string | null> {
  const authUserId = await getSessionAccountId();
  if (!authUserId) return null;
  const { data } = await getSupabaseAdmin()
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", authUserId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.tenant_id ?? null;
}

// POST /api/dispatch — lojista clicou "Enviar agora" numa oferta. body { id }
export async function POST(req: Request) {
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "id obrigatório." }, { status: 400 });

  if (!USE_SUPABASE) {
    const c = await enqueueDispatch(String(body.id));
    if (!c) return Response.json({ error: "Oferta não encontrada." }, { status: 404 });
    return Response.json(c, { status: 202 });
  }

  const tenantId = await resolveTenantId();
  if (!tenantId) return Response.json({ error: "Tenant não encontrado." }, { status: 403 });

  const c = await supaStore.enqueueBroadcast(tenantId, String(body.id));
  if (!c) return Response.json({ error: "Oferta não encontrada." }, { status: 404 });
  return Response.json({
    id: c.id,
    name: c.name,
    status: c.status,
    sent: c.sent,
    total: c.total,
  }, { status: 202 });
}
