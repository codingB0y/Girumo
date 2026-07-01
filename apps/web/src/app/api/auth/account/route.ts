import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    const supabase = getSupabaseAdmin();

    const { data: user } = await supabase
      .from("users")
      .select("name, email")
      .eq("auth_user_id", ctx.authUserId)
      .maybeSingle();

    return NextResponse.json({
      name: user?.name ?? "",
      email: ctx.email ?? user?.email ?? "",
      role: ctx.role,
      tenantId: ctx.tenantId,
    });
  } catch {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
}

export async function PATCH(req: Request) {
  const ctx = await getTenantContext(req);
  const supabase = getSupabaseAdmin();

  let body: { name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  // Update name in users table
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2) {
      return NextResponse.json({ error: "Nome precisa ter pelo menos 2 caracteres." }, { status: 400 });
    }
    await supabase
      .from("users")
      .update({ name })
      .eq("auth_user_id", ctx.authUserId);
  }

  // Update email via Supabase Auth
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    }
    const { error } = await supabase.auth.admin.updateUserById(ctx.authUserId, { email });
    if (error) {
      return NextResponse.json({ error: "Erro ao atualizar e-mail." }, { status: 500 });
    }
  }

  // Update password via Supabase Auth
  if (body.password !== undefined) {
    const password = String(body.password);
    if (password.length < 6) {
      return NextResponse.json({ error: "Senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
    }
    const { error } = await supabase.auth.admin.updateUserById(ctx.authUserId, { password });
    if (error) {
      return NextResponse.json({ error: "Erro ao atualizar senha." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const ctx = await getTenantContext(req);

  if (ctx.role !== "owner") {
    return NextResponse.json({ error: "Apenas o owner pode deletar a conta." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  // Remove user from auth (cascades via FK)
  const { error } = await supabase.auth.admin.deleteUser(ctx.authUserId);
  if (error) {
    return NextResponse.json({ error: "Erro ao deletar conta." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
