import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin-guard";
import { encerrarLoja } from "@/lib/billing/encerrar-loja";
import { getStripe } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

/**
 * POST — bulk actions on tenants
 * Body: { ids: string[], action: "suspend" | "activate" | "delete" }
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { ids, action } = body as { ids: string[]; action: "suspend" | "activate" | "delete" };

  if (!ids?.length || !action) {
    return NextResponse.json({ error: "ids and action required" }, { status: 400 });
  }

  if (!["suspend", "activate", "delete"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let affected = 0;

  // Suspender/excluir só no banco deixava o Stripe cobrando. Cada loja é
  // encerrada antes; a que falhar fica de fora da ação e volta no erro.
  const prontos: string[] = [];
  const falhas: string[] = [];
  if (action !== "activate") {
    for (const id of ids) {
      const encerrada = await encerrarLoja({ supabase, stripe: getStripe, tenantId: id });
      if (encerrada.error === null) prontos.push(id);
      else falhas.push(`${id}: ${encerrada.error}`);
    }
  }

  switch (action) {
    case "suspend": {
      if (prontos.length === 0) break;
      const { error } = await supabase
        .from("organizations")
        .update({ status: "suspended", suspended_at: new Date().toISOString() })
        .in("id", prontos);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // O webhook grava o cancelamento das assinaturas do Stripe; esta linha cobre
      // o plano dado à mão pelo admin, que não tem assinatura lá.
      const { error: subError } = await supabase
        .from("subscriptions")
        .update({ status: "canceled" })
        .in("tenant_id", prontos)
        .in("status", ["active", "trialing"]);

      if (subError) {
        return NextResponse.json({ error: subError.message }, { status: 500 });
      }

      affected = prontos.length;
      break;
    }

    case "activate": {
      const { error } = await supabase
        .from("organizations")
        .update({ status: "active", suspended_at: null })
        .in("id", ids);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      affected = ids.length;
      break;
    }

    case "delete": {
      if (prontos.length === 0) break;
      // Um delete só: memberships, subscriptions, instances, funnel_events, logs e
      // o resto caem pela FK `on delete cascade`. Os deletes em sequência de antes
      // deixavam a loja pela metade quando o último falhava.
      const { error } = await supabase
        .from("organizations")
        .delete()
        .in("id", prontos);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      affected = prontos.length;
      break;
    }
  }

  if (falhas.length > 0) {
    return NextResponse.json(
      {
        error: `${affected} tenant(s) processado(s); ${falhas.length} não, porque a cobrança não foi encerrada: ${falhas.join(" | ")}`,
        affected,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    affected,
    message: `${affected} tenant(s) ${action === "suspend" ? "suspenso(s)" : action === "activate" ? "ativado(s)" : "excluído(s)"}.`,
  });
}
