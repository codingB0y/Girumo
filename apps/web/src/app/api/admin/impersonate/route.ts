import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext, adminEmailFor } from "@/lib/admin-guard";
import { isImpersonateFresh } from "@/lib/admin/impersonate-session";
import { signSession, signImpersonate, verifyImpersonate, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const IMPERSONATE_COOKIE = "dz_impersonate";

/**
 * POST — iniciar impersonation
 * Body: { tenantId: string, userId?: string }
 * Gera sessão como o owner do tenant (ou userId específico)
 * Salva cookie de impersonation com dados do admin original
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { tenantId, userId } = body as { tenantId: string; userId?: string };

  if (!tenantId) {
    return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Verificar tenant existe
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", tenantId)
    .single();

  if (!org) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  // Encontrar user alvo (owner do tenant ou userId específico)
  let targetAuthUserId: string;

  if (userId) {
    // Usar user específico
    const { data: user } = await supabase
      .from("users")
      .select("auth_user_id")
      .eq("id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    targetAuthUserId = user.auth_user_id;
  } else {
    // Encontrar owner do tenant
    const { data: membership } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("role", "owner")
      .not("accepted_at", "is", null)
      .limit(1)
      .single();

    if (!membership) {
      // Fallback: qualquer membro
      const { data: anyMember } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .not("accepted_at", "is", null)
        .limit(1)
        .single();

      if (!anyMember) {
        return NextResponse.json({ error: "Tenant has no members" }, { status: 400 });
      }
      targetAuthUserId = anyMember.user_id;
    } else {
      targetAuthUserId = membership.user_id;
    }
  }

  // Gerar sessão como o user alvo
  const sessionToken = await signSession(targetAuthUserId);

  // Audit log: registrar impersonation
  await supabase.from("logs").insert({
    tenant_id: org.id,
    level: "warn",
    event: "admin.impersonate.start",
    message: `Admin ${admin.email} iniciou impersonation no tenant "${org.name}"`,
    metadata: {
      admin_user_id: admin.authUserId,
      admin_email: admin.email,
      target_user_id: targetAuthUserId,
      tenant_id: org.id,
      tenant_name: org.name,
    },
  });

  // Cookie de impersonation ASSINADO (HMAC) — impede forjar o adminAuthUserId.
  const impersonateData = await signImpersonate({
    adminAuthUserId: admin.authUserId,
    adminEmail: admin.email,
    tenantId: org.id,
    tenantName: org.name,
    startedAt: new Date().toISOString(),
  });

  const res = NextResponse.json({
    success: true,
    message: `Impersonando tenant "${org.name}"`,
    redirectTo: "/painel",
  });

  // Set session cookie (como o user do tenant)
  res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions);

  // Set impersonate cookie (pra saber que é admin impersonando)
  res.cookies.set(IMPERSONATE_COOKIE, impersonateData, {
    ...sessionCookieOptions,
    maxAge: 60 * 60 * 2, // 2 horas max
  });

  return res;
}

/**
 * DELETE — encerrar impersonation, voltar ao admin
 */
export async function DELETE(req: NextRequest) {
  const impersonateCookie = req.cookies.get(IMPERSONATE_COOKIE)?.value;

  if (!impersonateCookie) {
    return NextResponse.json({ error: "Not impersonating" }, { status: 400 });
  }

  // Verifica a ASSINATURA antes de confiar em adminAuthUserId — sem isto, qualquer
  // usuário forjaria este cookie e assumiria a sessão de outro (account takeover).
  // A assinatura não expira, então o `startedAt` do payload é cobrado logo abaixo:
  // um cookie copiado não pode virar sessão de super-admin meses depois.
  const adminData = await verifyImpersonate<{ adminAuthUserId: string; startedAt?: string }>(
    impersonateCookie,
  );
  if (!adminData?.adminAuthUserId || !isImpersonateFresh(adminData.startedAt)) {
    return NextResponse.json({ error: "Invalid impersonate cookie" }, { status: 400 });
  }

  // O cookie prova QUEM iniciou a impersonation, não que essa pessoa AINDA é
  // admin. Se o e-mail saiu de PLATFORM_ADMIN_EMAILS no meio da sessão, emitir
  // signSession aqui devolveria o super-admin já revogado.
  const stillAdmin = await adminEmailFor(adminData.adminAuthUserId);
  if (!stillAdmin) {
    // Derruba as duas pontas: sem isto o acesso revogado seguiria como o lojista.
    // `adminEmailFor` também falha fechada em erro do Supabase, então um blip de
    // rede custa um novo login — barato num caminho raro como este.
    const supabase = getSupabaseAdmin();
    await supabase.from("logs").insert({
      tenant_id: "00000000-0000-0000-0000-000000000001",
      level: "warn",
      event: "admin.impersonate.revoked",
      message: `Encerramento de impersonation recusado: ${adminData.adminAuthUserId} não é mais admin`,
      metadata: { admin_user_id: adminData.adminAuthUserId },
    });

    const denied = NextResponse.json({ error: "Admin access revoked" }, { status: 403 });
    denied.cookies.delete(IMPERSONATE_COOKIE);
    denied.cookies.delete(SESSION_COOKIE);
    return denied;
  }

  // Audit log: registrar fim de impersonation
  const supabase = getSupabaseAdmin();
  await supabase.from("logs").insert({
    tenant_id: "00000000-0000-0000-0000-000000000001",
    level: "info",
    event: "admin.impersonate.end",
    message: `Admin ${adminData.adminAuthUserId} encerrou impersonation`,
    metadata: { admin_user_id: adminData.adminAuthUserId },
  });

  // Restaurar sessão do admin
  const adminSession = await signSession(adminData.adminAuthUserId);

  const res = NextResponse.json({
    success: true,
    message: "Impersonation encerrada. Voltando ao admin.",
    redirectTo: "/admin",
  });

  // Restaurar cookie de sessão do admin
  res.cookies.set(SESSION_COOKIE, adminSession, sessionCookieOptions);

  // Remover cookie de impersonation
  res.cookies.delete(IMPERSONATE_COOKIE);

  return res;
}
