import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[squad-os/agents] GET error:", err);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("agents")
      .insert({
        workspace_id: body.workspace_id ?? "default",
        name: body.name,
        specialty: body.specialty,
        avatar_url: body.avatar_url ?? null,
        cost_per_run: body.cost_per_run ?? 0,
        speed_rating: body.speed_rating ?? 5,
        context_window: body.context_window ?? 200000,
        reputation: body.reputation ?? 50,
        allowed_areas: body.allowed_areas ?? [],
        limits: body.limits ?? {},
        history: body.history ?? [],
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[squad-os/agents] POST error:", err);
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
  }
}
