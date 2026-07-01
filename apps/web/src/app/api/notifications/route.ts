import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getTenantContext(req);
  const supabase = getSupabaseAdmin();

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);
  const unreadOnly = searchParams.get("unread") === "true";

  let query = supabase
    .from("notifications")
    .select("id, type, title, body, href, read_at, created_at")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Erro ao buscar notificações." }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function PATCH(req: Request) {
  const ctx = await getTenantContext(req);
  const supabase = getSupabaseAdmin();

  let body: { ids?: string[]; markAll?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (body.markAll) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("tenant_id", ctx.tenantId)
      .is("read_at", null);

    if (error) {
      return NextResponse.json({ error: "Erro ao marcar." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "Informe ids ou markAll." }, { status: 400 });
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", ctx.tenantId)
    .in("id", body.ids);

  if (error) {
    return NextResponse.json({ error: "Erro ao marcar." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
