import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getTenantContext(req);
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("tenant_webhooks")
    .select("id, type, phone, enabled, events, updated_at")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  return NextResponse.json(data ?? { enabled: false, phone: null, events: [] });
}

export async function PUT(req: Request) {
  const ctx = await getTenantContext(req);

  if (!hasPermission(ctx.role, "settings:connection")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  let body: { phone?: string; enabled?: boolean; events?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const phone = body.phone?.replace(/\D/g, "") ?? null;
  if (body.enabled && (!phone || phone.length < 10)) {
    return NextResponse.json({ error: "Informe um número válido." }, { status: 400 });
  }

  const validEvents = ["group_full", "lead_hot", "broadcast_failed", "lead_new", "warmup_complete"];
  const events = (body.events ?? []).filter((e) => validEvents.includes(e));

  const { data, error } = await supabase
    .from("tenant_webhooks")
    .upsert(
      {
        tenant_id: ctx.tenantId,
        type: "whatsapp",
        phone,
        enabled: body.enabled ?? true,
        events,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,type" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Erro ao salvar." }, { status: 500 });
  }

  return NextResponse.json(data);
}
