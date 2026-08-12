import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin-guard";

export async function GET() {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("decisions")
      .select("*")
      .eq("status", "active")
      .order("confidence", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[squad-os/decisions] GET error:", err);
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
      .from("decisions")
      .insert({
        workspace_id: body.workspace_id ?? "default",
        product_id: body.product_id ?? null,
        squad_id: body.squad_id ?? null,
        title: body.title,
        rationale: body.rationale ?? null,
        category: body.category ?? null,
        confidence: body.confidence ?? 70,
        status: body.status ?? "active",
        superseded_by: body.superseded_by ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[squad-os/decisions] POST error:", err);
    return NextResponse.json({ error: "Failed to create decision" }, { status: 500 });
  }
}
