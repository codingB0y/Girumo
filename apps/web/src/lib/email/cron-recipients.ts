/**
 * Quem pode receber os e-mails recorrentes do cron, e quando o dedupe libera.
 *
 * Os avisos recorrentes (desconexão, relatório semanal, risco dos 14 dias, grupo
 * sem segundo admin) varriam TODAS as organizations: quem cancelava continuava
 * recebendo um "WhatsApp desconectado" por dia, para sempre. A regra de quem tem
 * plano é a mesma do 402 (`subscriptionAccess`), para que o e-mail e o painel
 * nunca discordem sobre a mesma loja.
 */

import { subscriptionAccess } from "@/lib/billing/subscription-access";

export type SubscriptionRow = {
  status: string | null;
  metadata: unknown;
  current_period_end: string | null;
};

/** A assinatura da loja concede o plano agora? Sem linha = sem plano. */
export function temPlano(linha: SubscriptionRow | null, agora: Date): boolean {
  if (!linha) return false;
  return subscriptionAccess(
    {
      status: linha.status,
      stripeStatus: (linha.metadata as { stripe_status?: string | null } | null)?.stripe_status ?? null,
      periodEnd: linha.current_period_end,
    },
    agora,
  ).grantsPlan;
}

/**
 * O dedupe libera o envio? Só quando a leitura deu certo E não achou nada.
 *
 * Falha FECHADO, como `canSendAlert`: o código antigo lia só `data` de um
 * `maybeSingle` — erro de leitura, ou duas linhas (PGRST116), viravam "nada
 * enviado", e o e-mail saía de novo a cada rodada do cron. Um aviso atrasado é
 * recuperável; o mesmo e-mail de hora em hora ensina a marcar como spam.
 */
export function podeEnviar({ data, error }: { data: readonly unknown[] | null; error: unknown }): boolean {
  if (error) return false;
  return Array.isArray(data) && data.length === 0;
}
