import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin-guard";

export async function GET() {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("missions")
      .select("*")
      .order("priority", { ascending: true });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[squad-os/missions] GET error:", err);
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
      .from("missions")
      .insert({
        squad_id: body.squad_id,
        workspace_id: body.workspace_id ?? "default",
        title: body.title,
        description: body.description ?? null,
        status: body.status ?? "pending",
        priority: body.priority ?? 3,
        assigned_agent_id: body.assigned_agent_id ?? null,
        started_at: body.started_at ?? null,
        completed_at: body.completed_at ?? null,
        result: body.result ?? {},
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[squad-os/missions] POST error:", err);
    return NextResponse.json({ error: "Failed to create mission" }, { status: 500 });
  }
}
