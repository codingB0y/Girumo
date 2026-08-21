import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getResend, FROM_EMAIL } from "./client";
import { buildEmailLogRow, type EmailKind } from "./delivery-log";

type SendOptions = {
  to: string;
  subject: string;
  html: string;
  /** Dono do e-mail. public.logs.tenant_id é NOT NULL, então é obrigatório. */
  tenantId: string;
  /** Qual e-mail transacional é este. Vira metadata.kind no log. */
  kind: EmailKind;
};

/**
 * Grava o resultado do envio em public.logs.
 *
 * Best-effort de propósito: se o log falhar, o e-mail já saiu (ou já falhou) e
 * derrubar a requisição por causa do registro seria pior que não registrar.
 */
async function recordDelivery(
  options: SendOptions,
  ok: boolean,
  reason?: string | null,
): Promise<void> {
  try {
    const row = buildEmailLogRow({
      tenantId: options.tenantId,
      kind: options.kind,
      to: options.to,
      ok,
      reason,
    });

    await getSupabaseAdmin().from("logs").insert(row);
  } catch (err) {
    console.error("[email] Falha ao registrar entrega em logs:", err);
  }
}

/**
 * Envia email transacional via Resend.
 *
 * Não joga exception: devolve true/false. Independente do retorno, o resultado
 * fica em public.logs (event `email.sent` ou `email.failed`) — antes disto um
 * e-mail quebrado só existia como console.error e passava semanas invisível.
 */
export async function sendEmail(options: SendOptions): Promise<boolean> {
  const { to, subject, html } = options;

  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(`[email] Failed to send to ${to}:`, error.message);
      await recordDelivery(options, false, error.message);
      return false;
    }

    await recordDelivery(options, true);
    return true;
  } catch (err) {
    console.error(`[email] Exception sending to ${to}:`, err);
    await recordDelivery(options, false, err instanceof Error ? err.message : String(err));
    return false;
  }
}
