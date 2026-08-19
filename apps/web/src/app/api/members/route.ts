import { canRemoveMember } from "@/lib/auth/member-removal";
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

/**
 * Remove um membro ou revoga um convite pendente.
 *
 * `DELETE /api/members?id=<membership_id>`
 *
 * Toda query filtra `tenant_id` do contexto: o cliente é service-role e
 * bypassa RLS, então esse filtro é o que impede alcançar membership de outro
 * tenant passando um id adivinhado.
 */
export async function DELETE(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);

    const membershipId = new URL(req.url).searchParams.get("id")?.trim();
    if (!membershipId) {
      return Response.json({ error: "Parametro id obrigatorio." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: target, error: targetError } = await supabase
      .from("memberships")
      .select("id, user_id, role, invited_email, accepted_at")
      .eq("id", membershipId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    if (targetError) return Response.json({ error: targetError.message }, { status: 500 });
    if (!target) return Response.json({ error: "Membro nao encontrado." }, { status: 404 });

    // Owners ATIVOS (convite aceito). Um convite de owner pendente não segura o
    // tenant, então não deve bloquear a remoção do último owner de verdade.
    const { count: ownerCount, error: countError } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.tenantId)
      .eq("role", "owner")
      .not("user_id", "is", null)
      .not("accepted_at", "is", null);

    if (countError) return Response.json({ error: countError.message }, { status: 500 });

    const decision = canRemoveMember({
      actor: { role: ctx.role, authUserId: ctx.authUserId },
      target: { role: target.role as TenantRole, userId: target.user_id },
      ownerCount: ownerCount ?? 0,
    });

    if (!decision.allowed) {
      return Response.json({ error: decision.message }, { status: decision.status });
    }

    const { error: deleteError } = await supabase
      .from("memberships")
      .delete()
      .eq("id", membershipId)
      .eq("tenant_id", ctx.tenantId);

    if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

    // O perfil em `users` só sai junto quando o convite já tinha sido aceito;
    // convite pendente nunca criou perfil.
    if (target.user_id) {
      await supabase
        .from("users")
        .delete()
        .eq("tenant_id", ctx.tenantId)
        .eq("auth_user_id", target.user_id);
    }

    const alvo = target.invited_email ?? target.user_id ?? membershipId;
    await supabase.from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      level: "info",
      event: target.accepted_at ? "membership.removed" : "membership.invite_revoked",
      message: target.accepted_at ? `Membro ${alvo} removido.` : `Convite de ${alvo} revogado.`,
      metadata: { membership_id: membershipId, role: target.role },
    });

    return Response.json({ removed: true, id: membershipId });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao remover membro." }, { status: 500 });
  }
}
