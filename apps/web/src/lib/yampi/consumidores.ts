import type { ConexaoYampi, EventoYampi } from "./tipos";

/**
 * Ponto de extensão dos módulos que ouvem a Yampi. Cada módulo acrescenta UMA entrada no próprio PR, por
 * exemplo o Rastreio:
 *
 *   { nome: "rastreio", eventos: ["order.created", "order.paid", "order.status.updated"], ligado: rastreioLigado,
 *     consumir: (e) => registrarPedidoDaYampi(e.tenantId, e.recurso, "aviso") }
 *
 * `recurso` é o `resource` do envelope; o envelope inteiro vai em `payload`. O processador
 * (`processarEventoYampi`) chama em paralelo só os ligados que assinam o evento e marca o evento processado
 * depois de todos; se um falha, o cron roda TODOS de novo — por isso `consumir` tem de ser idempotente.
 */

export type EventoParaConsumir = {
  eventoId: string;
  tenantId: string;
  conexao: ConexaoYampi;
  evento: EventoYampi;
  time: string | null;
  recurso: unknown;
  payload: unknown;
};

export type ConsumidorDeEvento = {
  /** Vai para o log e para a coluna `error` do evento. */
  nome: string;
  eventos: readonly EventoYampi[];
  /** O módulo está ligado nesta loja? */
  ligado: (tenantId: string) => Promise<boolean>;
  /**
   * IDEMPOTENTE: a retentativa roda de novo, inclusive os que já deram certo. A mensagem do erro que lançar vai
   * para a coluna `error` do evento: sem telefone, código Pix ou outro dado do pedido.
   */
  consumir: (e: EventoParaConsumir) => Promise<unknown>;
};

export const CONSUMIDORES: readonly ConsumidorDeEvento[] = [];
