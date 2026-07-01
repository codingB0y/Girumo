import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("memories")
      .select("*")
      .order("score", { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[squad-os/memories] GET error:", err);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("memories")
      .insert({
        workspace_id: body.workspace_id ?? "default",
        layer: body.layer,
        category: body.category ?? null,
        content: body.content,
        source: body.source ?? null,
        confidence: body.confidence ?? 50,
        usage_count: body.usage_count ?? 0,
        impact_score: body.impact_score ?? 0,
        expires_at: body.expires_at ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[squad-os/memories] POST error:", err);
    return NextResponse.json({ error: "Failed to create memory" }, { status: 500 });
  }
}
