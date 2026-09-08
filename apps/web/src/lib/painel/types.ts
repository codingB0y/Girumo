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

/**
 * Estado de UMA consulta. Três valores, nunca dois.
 *
 * Um booleano funde "ainda não respondeu" com "respondeu que falhou", e a
 * série do painel já pagou duas vezes por isso: no PR #261 o erro do gate de
 * plano virou esqueleto eterno (a mensagem e o botão de upgrade nunca chegaram
 * à tela), e no PR #262 o carregamento normal virou "Não deu para carregar".
 * Uma consulta por carga: quem falhou não apaga o que os vizinhos trouxeram.
 */
export type Carga = "carregando" | "ok" | "erro";
