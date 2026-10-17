/**
 * Respostas de `/api/vendas/*` (spec 2026-10-07 §3; contrato PR 4 → PR 5 no
 * índice). Sem `server-only`: a tela de vendas importa daqui.
 */
export type ItemDeVenda = { nome: string; quantidade: number; valorUnitario: number };
export type ContatoDaVenda = { id: string; nome: string | null; telefone: string };
export type BuscaDeContato = { contato: ContatoDaVenda | null; optout: boolean };
/** `orders.source`: registrada no painel ou importada do Bling (spec 2026-10-13-integracao-bling §1). */
export type OrigemDaVenda = "manual" | "bling";
export type VendaDoMes = {
  id: string; cliente: string | null; telefone: string; total: number; criadaEm: string;
  itens: ItemDeVenda[]; editavel: boolean; origem: OrigemDaVenda;
};
/** `blingAtivo`: a loja tem conexão ativa com o Bling (a tela avisa para não registrar a venda duas vezes). */
export type VendasDoMes = { mes: string; total: number; quantidade: number; truncado: boolean;
  vendas: VendaDoMes[]; blingAtivo: boolean };

/** Corpo do 409 de PATCH/DELETE numa venda do Bling: ele é a fonte da verdade, a Girumo não muda a venda. */
export const ERRO_VENDA_DO_BLING = "Venda do Bling: altere no Bling.";
