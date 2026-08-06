import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-guard";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { blockInProduction, isDev } from "@/lib/environment";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dev-tools/reset
 * Limpa todas as tabelas do banco DEV.
 * ⚠️  BLOQUEADO em produção.
 */
export async function POST() {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    blockInProduction("reset-database");
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }

  if (!isDev()) {
    return NextResponse.json({ error: "Apenas em development" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const results: string[] = [];

  try {
    // Ordem: dependências primeiro (FK)
    const tables = [
      "funnel_events",
      "agent_configs",
      "admin_alerts",
      "logs",
      "instances",
      "subscriptions",
      "memberships",
      "users",
      "organizations",
      "plans",
    ];

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) {
        results.push(`⚠️ ${table}: ${error.message}`);
      } else {
        results.push(`✅ ${table} limpa`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "🗑️ Banco DEV resetado",
      details: results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), details: results },
      { status: 500 }
    );
  }
}
