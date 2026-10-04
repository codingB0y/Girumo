import {
  subscriptionAccess,
  subscriptionNotice,
  type SubscriptionAccess,
} from "@/lib/billing/subscription-access";

/**
 * Os campos da linha de `GET /api/subscription` que decidem o que a aba Plano diz.
 *
 * A rota faz `select("*, plans(*)")`, então todos já vêm no payload. Sem `metadata`
 * e `current_period_end` não dá para separar boleto emitido (que CONCEDE acesso) de
 * cobrança falhada; sem `cancel_at_period_end`, o teste cancelado no portal (termina
 * sem cobrar) vira o teste que cobra no 8º dia — e a tela anuncia uma cobrança que
 * não vem.
 */
export type LinhaDaAssinatura = {
  status?: string;
  metadata?: { stripe_status?: string | null; cancel_reason?: string | null } | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
};

export type EstadoDoPlano = SubscriptionAccess & { recado: string };

/**
 * Linha carregada → acesso e frase da aba Plano.
 *
 * Fora da página para ser testado: os campos do `subscriptionAccess` são opcionais,
 * então esquecer um deles compila — e esquecer `cancel_at_period_end` ou o fim do
 * período no recado faria Configurações anunciar a 1ª cobrança a quem já cancelou.
 */
export function estadoDoPlano(sub: LinhaDaAssinatura | null, agora: Date): EstadoDoPlano | null {
  if (!sub) return null;
  const periodEnd = sub.current_period_end ?? null;
  const acesso = subscriptionAccess(
    {
      status: sub.status ?? null,
      stripeStatus: sub.metadata?.stripe_status ?? null,
      periodEnd,
      cancelReason: sub.metadata?.cancel_reason ?? null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? null,
    },
    agora,
  );
  return { ...acesso, recado: subscriptionNotice(acesso.state, periodEnd) };
}
