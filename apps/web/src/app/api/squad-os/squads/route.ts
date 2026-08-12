import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin-guard";

export async function GET() {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("squads")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[squad-os/squads] GET error:", err);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: Request) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("squads")
      .insert({
        workspace_id: body.workspace_id ?? "default",
        product_id: body.product_id ?? null,
        name: body.name,
        slug: body.slug,
        leader_agent_id: body.leader_agent_id ?? null,
        objective: body.objective ?? null,
        status: body.status ?? "planning",
        health: body.health ?? 100,
        context: body.context ?? {},
        last_delivery: body.last_delivery ?? null,
        next_action: body.next_action ?? null,
        reputation_score: body.reputation_score ?? 50,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[squad-os/squads] POST error:", err);
    return NextResponse.json({ error: "Failed to create squad" }, { status: 500 });
  }
}
