import { normalizeChurnReason } from "@/lib/billing/churn";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertBillingRole, getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registra por que o lojista está cancelando.
 *
 * Antes disso o textarea "O que podemos melhorar?" da tela de cancelamento
 * coletava o motivo e o descartava: nada era enviado. Grava em `logs`, que já
 * aceita este formato — nenhuma migration é necessária.
 *
 * Falhar aqui não pode travar o cancelamento. Quem chama trata a resposta como
 * best-effort e segue para o portal do Stripe de qualquer jeito.
 */
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const reason = normalizeChurnReason(body.reason);
    if (!reason) {
      // Cancelar sem escrever nada é legítimo: não é erro, só não há o que gravar.
      return Response.json({ recorded: false });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("logs").insert({
      tenant_id: ctx.tenantId,
      level: "info",
      event: "billing.churn.reason",
      message: reason,
      metadata: { source: "painel/configuracoes/cancelar" },
    });

    if (error) {
      console.error("Falha ao gravar motivo de churn", error);
      return Response.json({ error: "Não foi possível registrar o motivo." }, { status: 500 });
    }

    return Response.json({ recorded: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return Response.json({ error: "Erro ao registrar motivo de cancelamento." }, { status: 500 });
  }
}
