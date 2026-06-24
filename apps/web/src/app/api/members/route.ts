import { assertPlanLimit } from "@/lib/billing/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertBillingRole, getTenantContext, type TenantRole } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVITABLE_ROLES = new Set<TenantRole>(["admin", "operator"]);

function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

function normalizeRole(role: unknown): TenantRole {
  const value = String(role ?? "operator").toLowerCase();
  return INVITABLE_ROLES.has(value as TenantRole) ? (value as TenantRole) : "operator";
}

export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);

    const { data, error } = await getSupabaseAdmin()
      .from("memberships")
      .select("id, user_id, role, invited_email, accepted_at, created_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data ?? []);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao listar membros." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);

    const body = (await req.json().catch(() => ({}))) as { email?: string; role?: string };
    const invitedEmail = normalizeEmail(body.email);
    const role = normalizeRole(body.role);

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(invitedEmail)) {
      return Response.json({ error: "E-mail invalido." }, { status: 400 });
    }

    await assertPlanLimit(ctx.tenantId, "team_members:invite");

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from("memberships")
      .select("id, accepted_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("invited_email", invitedEmail)
      .maybeSingle();

    if (existing) {
      return Response.json({ error: "Este e-mail ja possui convite ou membership neste tenant." }, { status: 409 });
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("tenant_id", ctx.tenantId)
      .eq("email", invitedEmail)
      .maybeSingle();

    if (existingUser) {
      return Response.json({ error: "Este e-mail ja e membro deste tenant." }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("memberships")
      .insert({
        tenant_id: ctx.tenantId,
        user_id: null,
        role,
        invited_by: ctx.authUserId,
        invited_email: invitedEmail,
        accepted_at: null,
      })
      .select("id, role, invited_email, accepted_at, created_at")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    await supabase.from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      level: "info",
      event: "membership.invited",
      message: `Convite criado para ${invitedEmail}.`,
      metadata: { membership_id: data.id, role },
    });

    return Response.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao convidar membro." }, { status: 500 });
  }
}
