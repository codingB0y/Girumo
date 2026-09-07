import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nome da loja pro letreiro. Falha aqui não derruba o /me: vira null. */
async function tenantName(tenantId: string): Promise<string | null> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("organizations")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle();
    return typeof data?.name === "string" && data.name.trim() ? data.name.trim() : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    return NextResponse.json({
      userId: ctx.authUserId,
      email: ctx.email,
      tenantId: ctx.tenantId,
      tenantName: await tenantName(ctx.tenantId),
      role: ctx.role,
    });
  } catch {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
}
