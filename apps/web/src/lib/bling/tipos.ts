/**
 * Tipos do Bling que circulam entre a API (`api.ts`), as regras (`classificar.ts`),
 * o motor e as stores. Ficam num arquivo só para nenhum desses módulos depender
 * do outro só por causa de um tipo.
 *
 * Já normalizados: o que a API do Bling devolve passa por `api.ts` antes de
 * virar um destes; campo ausente ou inválido é `null`, nunca string vazia.
 */

/** Situação de pedido de venda. `base` = a situação padrão de que ela herda (ela mesma, se for padrão). */
export type SituacaoBling = { id: number; nome: string; base: number };

/** O que importa de um pedido, da lista ou do detalhe. `data` é o dia do pedido, `YYYY-MM-DD`. */
export type PedidoResumo = {
  id: number;
  numero: string | null;
  data: string | null;
  total: number;
  contatoId: number | null;
  situacaoId: number;
  /** O canal de venda (`loja.id`: Yampi, Nuvemshop...); null = lançado direto no Bling (o Bling manda 0). */
  lojaId: number | null;
};

export type ContatoBling = {
  id: number;
  nome: string | null;
  /** F = pessoa física, J = jurídica, E = estrangeiro. */
  tipo: "F" | "J" | "E" | null;
  celular: string | null;
  telefone: string | null;
  email: string | null;
  emailNotaFiscal: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  pais: string | null;
  /** `YYYY-MM-DD`. */
  dataNascimento: string | null;
  sexo: "M" | "F" | null;
};

export type EmpresaBling = { id: string; nome: string | null };

/** Como a Girumo trata um pedido do Bling (spec §1 "Tipo do pedido"). */
export type TipoPedido = "venda" | "pedido" | "ignorado" | "excluido";
