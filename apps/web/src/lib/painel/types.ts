/**
 * Tipos que as telas do painel consomem das rotas de API.
 *
 * Moram fora das páginas para que qualquer outro consumidor se acople ao mesmo
 * contrato em TIPO — e pare de compilar quando a rota mudar, em vez de exibir
 * em silêncio um formato que o produto não usa mais. Nasceram no modo
 * demonstração (revertido em 31/08/2026); o `painel/contatos` seguiu usando.
 */

export type LeadStatus = "novo" | "ativo" | "comprou";

export type Lead = {
  id: string;
  name: string;
  phone: string;
  sourceGroup: string;
  sourceCampaign: string;
  status: LeadStatus;
  enteredAt: string;
  /** ISO da última saída de grupo, ou null se nunca saiu. */
  leftAt?: string | null;
};
