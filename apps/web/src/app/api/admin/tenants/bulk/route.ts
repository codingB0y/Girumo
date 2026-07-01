import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

/**
 * POST — bulk actions on tenants
 * Body: { ids: string[], action: "suspend" | "activate" | "delete" }
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { ids, action } = body as { ids: string[]; action: "suspend" | "activate" | "delete" };

  if (!ids?.length || !action) {
    return NextResponse.json({ error: "ids and action required" }, { status: 400 });
  }

  if (!["suspend", "activate", "delete"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let affected = 0;

  switch (action) {
    case "suspend": {
      const { error } = await supabase
        .from("organizations")
        .update({ status: "suspended", suspended_at: new Date().toISOString() })
        .in("id", ids);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Cancelar subscriptions
      await supabase
        .from("subscriptions")
        .update({ status: "canceled" })
        .in("tenant_id", ids)
        .in("status", ["active", "trialing"]);

      affected = ids.length;
      break;
    }

    case "activate": {
      const { error } = await supabase
        .from("organizations")
        .update({ status: "active", suspended_at: null })
        .in("id", ids);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      affected = ids.length;
      break;
    }

    case "delete": {
      // Cascade delete
      await supabase.from("memberships").delete().in("tenant_id", ids);
      await supabase.from("subscriptions").delete().in("tenant_id", ids);
      await supabase.from("instances").delete().in("tenant_id", ids);
      await supabase.from("funnel_events").delete().in("tenant_id", ids);
      await supabase.from("logs").delete().in("tenant_id", ids);

      const { error } = await supabase
        .from("organizations")
        .delete()
        .in("id", ids);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      affected = ids.length;
      break;
    }
  }

  return NextResponse.json({
    success: true,
    affected,
    message: `${affected} tenant(s) ${action === "suspend" ? "suspenso(s)" : action === "activate" ? "ativado(s)" : "excluído(s)"}.`,
  });
}
