import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    return NextResponse.json({
      userId: ctx.authUserId,
      email: ctx.email,
      tenantId: ctx.tenantId,
      role: ctx.role,
    });
  } catch {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
}
