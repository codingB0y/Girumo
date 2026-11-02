import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminContext } from "@/lib/admin-guard";
import { addonNoStripe, customerDaLoja } from "@/lib/billing/instagram-contexto";
import { registrarAviso } from "@/lib/recuperar/aviso";
import { decidirLiberacao, type AcaoDeLiberacao } from "@/lib/recuperar/liberacao-admin";
import { setRecuperarEnabled } from "@/lib/stores/tenant-settings";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lerCorpo(raw: unknown): { acao: AcaoDeLiberacao; avisoConfirmado: boolean } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { acao, avisoConfirmado } = raw as { acao?: unknown; avisoConfirmado?: unknown };
  if (acao !== "ligar" && acao !== "desligar") return null;
  if (avisoConfirmado !== undefined && typeof avisoConfirmado !== "boolean") return null;
  return { acao, avisoConfirmado: avisoConfirmado === true };
}

/**
 * Liberação manual do Recuperar (loja piloto): liga sem Stripe e sem cobrança, só depois
 * da confirmação do aviso de privacidade. A liberação manual não desliga com o plano.
 * Desligar é recusado (409) quando a loja tem assinatura do Recuperar viva no Stripe: o
 * próximo evento do Stripe ligaria de novo.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });

  const corpo = lerCorpo(await req.json().catch(() => null));
  if (!corpo) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  const { acao, avisoConfirmado } = corpo;

  const supabase = getSupabaseAdmin();
  try {
    const { data: org, error: orgError } = await supabase.from("organizations").select("id").eq("id", id).maybeSingle();
    if (orgError) throw new Error(orgError.message);
    if (!org) return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });

    let assinaturaNoStripe = false;
    if (acao === "desligar") {
      const customerId = await customerDaLoja(id);
      assinaturaNoStripe = customerId ? (await addonNoStripe(customerId, id, "recuperar")).viva : false;
    }

    const decisao = decidirLiberacao({ acao, avisoConfirmado, assinaturaNoStripe });
    if (!decisao.ok) return NextResponse.json({ error: decisao.error }, { status: decisao.status });

    if (acao === "ligar") {
      const aviso = await registrarAviso(supabase, { tenantId: id, userId: admin.authUserId, origem: "admin" });
      if (aviso.error) {
        console.error("[admin/tenants/recuperar] registro do aviso falhou:", aviso.error);
        return NextResponse.json({ error: "Não foi possível registrar o aviso de privacidade. Tente de novo." }, { status: 500 });
      }
    }

    await setRecuperarEnabled(id, acao === "ligar");

    const { error: logError } = await supabase.from("logs").insert({
      tenant_id: id,
      actor_user_id: admin.authUserId,
      level: "warn",
      event: `admin.recuperar.${acao}`,
      message: `Admin ${admin.email} ${acao === "ligar" ? "liberou" : "desligou"} o Recuperar à mão.`,
      metadata: { admin_email: admin.email },
    });
    // A liberação já mudou: falhar a resposta faria o admin repetir. Fica no console.
    if (logError) console.error("[admin/tenants/recuperar] log de auditoria falhou:", logError.message);

    return NextResponse.json({
      success: true,
      message:
        acao === "ligar"
          ? "Recuperar liberado para a loja. Sem cobrança."
          : "Recuperar desligado. As telas voltam a mostrar a oferta; os dados ficam guardados.",
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) return NextResponse.json({ error: `Stripe: ${error.message}` }, { status: 502 });
    console.error("[admin/tenants/recuperar]", error);
    return NextResponse.json({ error: "Erro ao atualizar o Recuperar." }, { status: 500 });
  }
}
