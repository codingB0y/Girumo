import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin-guard";

/**
 * GET — retorna todas as settings da plataforma
 * PUT — atualiza settings (upsert por key)
 */

export async function GET() {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("key, value, updated_at")
    .order("key");

  if (error) {
    // Tabela pode não existir ainda
    return NextResponse.json({ settings: [], error: error.message });
  }

  return NextResponse.json({ settings: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { settings } = body as { settings: { key: string; value: string }[] };

  if (!settings || !Array.isArray(settings)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const upserts = settings.map((s) => ({
    key: s.key,
    value: s.value,
    updated_at: new Date().toISOString(),
    updated_by: admin.email,
  }));

  const { error } = await supabase
    .from("platform_settings")
    .upsert(upserts, { onConflict: "key" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: upserts.length });
}
