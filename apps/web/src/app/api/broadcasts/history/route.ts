import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getTenantContext(req);
  const supabase = getSupabaseAdmin();

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 30, 100);
  const offset = Number(searchParams.get("offset")) || 0;

  const { data, error, count } = await supabase
    .from("broadcasts")
    .select("id, campaign_name, group_ids, status, sent_count, failed_count, scheduled_at, completed_at, created_at", { count: "exact" })
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: "Erro ao buscar histórico." }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [], total: count ?? 0 });
}
