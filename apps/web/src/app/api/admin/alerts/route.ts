import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

/**
 * GET — lista alertas admin (últimos 50, não-lidos primeiro)
 * Query params: ?unread=true (apenas não lidos)
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("admin_alerts")
    .select("id, type, severity, title, message, metadata, tenant_id, read_at, resolved_at, created_at", { count: "exact" });

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  query = query.order("created_at", { ascending: false }).limit(50);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ alerts: [], count: 0, error: error.message });
  }

  return NextResponse.json({ alerts: data ?? [], count: count ?? 0 });
}

/**
 * PATCH — marcar alertas como lidos ou resolvidos
 * Body: { ids: string[], action: "read" | "resolve" }
 */
export async function PATCH(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { ids, action } = body as { ids: string[]; action: "read" | "resolve" };

  if (!ids?.length || !action) {
    return NextResponse.json({ error: "ids and action required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const update = action === "read"
    ? { read_at: now }
    : { resolved_at: now, read_at: now };

  const { error } = await supabase
    .from("admin_alerts")
    .update(update)
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, affected: ids.length });
}

/**
 * POST — criar alerta manualmente (ou via sistema)
 * Body: { type, severity, title, message?, tenantId? }
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { type, severity, title, message, tenantId, metadata } = body as {
    type: string;
    severity?: string;
    title: string;
    message?: string;
    tenantId?: string;
    metadata?: Record<string, unknown>;
  };

  if (!type || !title) {
    return NextResponse.json({ error: "type and title required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("admin_alerts")
    .insert({
      type,
      severity: severity ?? "info",
      title,
      message: message ?? null,
      tenant_id: tenantId ?? null,
      metadata: metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id });
}
