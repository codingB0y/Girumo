import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-guard";
import { setRastreioEnabled } from "@/lib/stores/tenant-settings";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST { enabled } — libera ou tira o Rastreio de pedidos da loja.
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const enabled = body.enabled;

  try {
    const supabase = getSupabaseAdmin();
    const { data: loja, error: lojaErro } = await supabase.from("organizations").select("id").eq("id", id).maybeSingle();
    if (lojaErro) throw new Error(lojaErro.message);
    if (!loja) return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });

    await setRastreioEnabled(id, enabled);

    const { error } = await supabase.from("logs").insert({
      tenant_id: id,
      actor_user_id: admin.authUserId,
      level: "warn",
      event: "admin.rastreio.liberacao",
      message: enabled ? "Rastreio de pedidos liberado" : "Rastreio de pedidos retirado",
      metadata: { admin_email: admin.email, enabled },
    });
    // A liberação já mudou: falhar a resposta faria o admin repetir. Fica no console.
    if (error) console.error("[admin/tenants/rastreio] log de auditoria falhou:", error.message);

    return NextResponse.json({ enabled });
  } catch (error) {
    console.error("[admin/tenants/rastreio] falhou:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Não deu para salvar. Tente de novo." }, { status: 500 });
  }
}
