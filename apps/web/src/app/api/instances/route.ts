import { assertPlanLimit } from "@/lib/billing/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canManageInstances(role: string) {
  return role === "owner" || role === "admin";
}

export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    const { data, error } = await getSupabaseAdmin()
      .from("instances")
      .select("id, name, phone, status, qr_code, last_seen_at, metadata, created_at, updated_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data ?? []);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao listar instancias." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    if (!canManageInstances(ctx.role)) {
      return Response.json({ error: "Sem permissao para criar instancia." }, { status: 403 });
    }

    await assertPlanLimit(ctx.tenantId, "instances:create");

    const body = (await req.json().catch(() => ({}))) as { name?: string; phone?: string };
    const name = String(body.name ?? "WhatsApp").trim().slice(0, 80) || "WhatsApp";
    const phone = String(body.phone ?? "").trim() || null;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("instances")
      .insert({
        tenant_id: ctx.tenantId,
        name,
        phone,
        status: "pending",
        metadata: {},
      })
      .select("id, name, phone, status, created_at")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    await supabase.from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      level: "info",
      event: "instance.created",
      message: `Instancia ${name} criada.`,
      metadata: { instance_id: data.id },
    });

    return Response.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao criar instancia." }, { status: 500 });
  }
}
