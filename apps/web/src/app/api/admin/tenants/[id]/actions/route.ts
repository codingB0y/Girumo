import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin-guard";
import { encerrarLoja, resumoDoEncerramento } from "@/lib/billing/encerrar-loja";
import { getStripe } from "@/lib/billing/stripe";

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
      // Stripe primeiro: suspender só no banco deixava o cartão cobrado todo mês.
      const encerrada = await encerrarLoja({ supabase, stripe: getStripe, tenantId: id });
      if (encerrada.error !== null) {
        return NextResponse.json({ error: `Nada foi suspenso. ${encerrada.error}` }, { status: 502 });
      }

      const { error } = await supabase
        .from("organizations")
        .update({ status: "suspended", suspended_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // O webhook grava o cancelamento das assinaturas do Stripe; esta linha cobre
      // o plano dado à mão pelo admin, que não tem assinatura lá.
      const { error: subError } = await supabase
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("tenant_id", id)
        .in("status", ["active", "trialing"]);

      if (subError) {
        return NextResponse.json({ error: subError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Tenant "${org.name}" suspenso. ${resumoDoEncerramento(encerrada)}`,
      });
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
      // Apagar a loja não cancela nada no Stripe: sem isto, a cobrança seguia
      // numa loja que nem existe mais.
      const encerrada = await encerrarLoja({ supabase, stripe: getStripe, tenantId: id });
      if (encerrada.error !== null) {
        return NextResponse.json({ error: `Nada foi excluído. ${encerrada.error}` }, { status: 502 });
      }

      // Um delete só: memberships, subscriptions, instances, funnel_events, logs e
      // o resto caem pela FK `on delete cascade`. Os deletes em sequência de antes
      // deixavam a loja pela metade quando o último falhava.
      const { error } = await supabase
        .from("organizations")
        .delete()
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Tenant "${org.name}" excluído permanentemente. ${resumoDoEncerramento(encerrada)}`,
      });
    }
  }
}
