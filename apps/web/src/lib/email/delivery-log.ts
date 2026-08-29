/**
 * Monta a linha de public.logs que registra a entrega (ou a falha) de um e-mail
 * transacional.
 *
 * Vive separado de send.ts porque send.ts importa "server-only" e não roda sob
 * `tsx --test`. Aqui fica só a decisão de o que gravar; o insert é do send.ts.
 */

/** Cada e-mail transacional do produto. Vira sufixo do evento no log. */
export type EmailKind =
  | "welcome"
  | "invite"
  | "nudge_connect"
  | "activation"
  | "disconnect"
  | "weekly"
  | "broadcast_failed"
  | "inactivity_risk"
  | "alert_optout";

export type EmailDelivery = {
  tenantId: string;
  kind: EmailKind;
  to: string;
  /** false quando o Resend recusou ou a chamada levantou exceção. */
  ok: boolean;
  /** Motivo da falha, como veio do Resend ou da exceção. Ignorado quando ok. */
  reason?: string | null;
};

export type EmailLogRow = {
  tenant_id: string;
  level: "info" | "error";
  event: "email.sent" | "email.failed";
  message: string;
  metadata: Record<string, unknown>;
};

/**
 * Esconde o miolo do endereço: "financeiromegastock@gmail.com" vira
 * "fi***@gmail.com". O log é lido no painel, e o endereço inteiro não
 * acrescenta nada a quem só quer saber se saiu.
 */
export function maskEmail(email: string): string {
  const value = String(email ?? "").trim();
  const at = value.lastIndexOf("@");
  if (at <= 0) return "***";

  const local = value.slice(0, at);
  const domain = value.slice(at);
  const head = local.slice(0, 2);
  return `${head}***${domain}`;
}

const REASON_MAX = 300;

export function buildEmailLogRow(delivery: EmailDelivery): EmailLogRow {
  const masked = maskEmail(delivery.to);

  if (delivery.ok) {
    return {
      tenant_id: delivery.tenantId,
      level: "info",
      event: "email.sent",
      message: `E-mail "${delivery.kind}" enviado para ${masked}.`,
      metadata: { kind: delivery.kind, to: masked },
    };
  }

  const reason = String(delivery.reason ?? "").trim().slice(0, REASON_MAX);

  return {
    tenant_id: delivery.tenantId,
    level: "error",
    event: "email.failed",
    message: `E-mail "${delivery.kind}" NÃO foi enviado para ${masked}.`,
    metadata: {
      kind: delivery.kind,
      to: masked,
      reason: reason || "motivo desconhecido",
    },
  };
}
