import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("handoffs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[squad-os/handoffs] GET error:", err);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("handoffs")
      .insert({
        workspace_id: body.workspace_id ?? "default",
        from_squad_id: body.from_squad_id,
        to_squad_id: body.to_squad_id,
        mission_id: body.mission_id ?? null,
        context: body.context ?? {},
        status: body.status ?? "pending",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[squad-os/handoffs] POST error:", err);
    return NextResponse.json({ error: "Failed to create handoff" }, { status: 500 });
  }
}
