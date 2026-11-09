/** Estados de `yampi_connections.status` (CHECK do PR 1a). */
export const STATUS_YAMPI = ["ativa", "credencial_invalida", "aviso_desativado", "desconectada"] as const;
export type StatusYampi = (typeof STATUS_YAMPI)[number];

/** Os cinco avisos que a Girumo assina na Yampi (spec, "Aviso da Yampi"). */
export const EVENTOS_YAMPI = [
  "cart.reminder",
  "order.created",
  "order.paid",
  "order.status.updated",
  "transaction.payment.refused",
] as const;
export type EventoYampi = (typeof EVENTOS_YAMPI)[number];

/** Uma loja ↔ uma conta Yampi, a mesma para o Rastreio e o Recuperar. Credencial só selada, nunca em texto. */
export type ConexaoYampi = {
  id: string;
  tenantId: string;
  alias: string;
  status: StatusYampi;
  userTokenSelado: string | null;
  userSecretKeySelado: string | null;
  webhookId: string | null;
  webhookSecretSelado: string | null;
  lastEventAt: string | null;
  lastCheckAt: string | null;
  lastError: string | null;
};
