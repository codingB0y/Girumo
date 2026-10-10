/**
 * Respostas de `/api/vendas/*` (spec 2026-10-07 §3; contrato PR 4 → PR 5 no
 * índice). Sem `server-only`: a tela de vendas importa daqui.
 */
export type ItemDeVenda = { nome: string; quantidade: number; valorUnitario: number };
export type ContatoDaVenda = { id: string; nome: string | null; telefone: string };
export type BuscaDeContato = { contato: ContatoDaVenda | null; optout: boolean };
export type VendaDoMes = {
  id: string; cliente: string | null; telefone: string; total: number; criadaEm: string;
  itens: ItemDeVenda[]; editavel: boolean;
};
export type VendasDoMes = { mes: string; total: number; quantidade: number; truncado: boolean;
  vendas: VendaDoMes[] };
