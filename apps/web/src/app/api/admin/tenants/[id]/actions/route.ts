import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin-guard";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action } = body as { action: "suspend" | "activate" | "delete" };

  if (!action || !["suspend", "activate", "delete"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Verificar se tenant existe
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, status")
    .eq("id", id)
    .single();

  if (orgError || !org) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  switch (action) {
    case "suspend": {
      const { error } = await supabase
        .from("organizations")
        .update({ status: "suspended", suspended_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Cancelar subscriptions ativas
      await supabase
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("tenant_id", id)
        .in("status", ["active", "trialing"]);

      return NextResponse.json({ success: true, message: `Tenant "${org.name}" suspenso.` });
    }

    case "activate": {
      const { error } = await supabase
        .from("organizations")
        .update({ status: "active", suspended_at: null })
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: `Tenant "${org.name}" reativado.` });
    }

    case "delete": {
      // Deletar em cascata: memberships → subscriptions → instances → org
      await supabase.from("memberships").delete().eq("tenant_id", id);
      await supabase.from("subscriptions").delete().eq("tenant_id", id);
      await supabase.from("instances").delete().eq("tenant_id", id);
      await supabase.from("funnel_events").delete().eq("tenant_id", id);
      await supabase.from("logs").delete().eq("tenant_id", id);

      const { error } = await supabase
        .from("organizations")
        .delete()
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: `Tenant "${org.name}" excluído permanentemente.` });
    }
  }
}
