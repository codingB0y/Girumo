import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getResend, FROM_EMAIL } from "./client";
import { buildEmailLogRow, maskEmail, type EmailKind } from "./delivery-log";

type SendOptions = {
  to: string;
  subject: string;
  html: string;
  /** Dono do e-mail. public.logs.tenant_id é NOT NULL, então é obrigatório. */
  tenantId: string;
  /** Qual e-mail transacional é este. Vira metadata.kind no log. */
  kind: EmailKind;
  /**
   * Vira o header `Idempotency-Key` do Resend: um reenvio com a mesma chave não
   * gera um segundo e-mail. Para quem pede reenvio na falha (webhook do Stripe).
   */
  idempotencyKey?: string;
  /** Só o nome de exibição do remetente; o endereço segue o de FROM_EMAIL. */
  fromName?: string;
  /** Parte em texto puro do mesmo e-mail. */
  text?: string;
};

const PROIBIDOS = '<>"\\@';
/** Monta o From com o nome de exibição limpo (sem < > " \ @ nem quebra de linha, até 60 caracteres). */
export function remetenteComNome(base: string, nome: string | undefined): string {
  const colapsado = Array.from(nome ?? "")
    .map((c) => (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(c) || PROIBIDOS.includes(c) ? " " : c))
    .join("").replace(/\s+/g, " ").trim();
  // Corta por ponto de código, para não partir um emoji ao meio.
  const limpo = Array.from(colapsado).slice(0, 60).join("").trim();
  if (!limpo) return base;
  const dentro = /<([^>]+)>\s*$/.exec(base);
  return `"${limpo}" <${(dentro ? dentro[1] : base).trim()}>`;
}

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
  const { to, subject, html, idempotencyKey, fromName, text } = options;

  try {
    const resend = getResend();
    const { error } = await resend.emails.send(
      {
        from: remetenteComNome(FROM_EMAIL, fromName),
        to,
        subject,
        html,
        text,
      },
      { idempotencyKey },
    );

    if (error) {
      // O endereço da pessoa não vai inteiro para o log (o mesmo mascaramento de public.logs).
      console.error(`[email] Failed to send to ${maskEmail(to)}:`, error.message);
      await recordDelivery(options, false, error.message);
      return false;
    }

    await recordDelivery(options, true);
    return true;
  } catch (err) {
    console.error(`[email] Exception sending to ${maskEmail(to)}:`, err);
    await recordDelivery(options, false, err instanceof Error ? err.message : String(err));
    return false;
  }
}
