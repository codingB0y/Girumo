import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/tenants/list
 * Retorna lista simplificada de tenants para o switch tenant no dev banner.
 */
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, slug, status")
    .order("name", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tenants: data ?? [] });
}
