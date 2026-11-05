/**
 * O que as rotas de Pessoas devolvem à tela. Sem `server-only` de propósito: a tela importa SÓ tipos
 * daqui, e o id do Instagram (`ig_user_id`) nunca sai do servidor.
 */

export type PessoaDto = {
  id: string;
  /** Sem o "@". */
  username: string | null;
  fields: Record<string, string | number | boolean>;
  tags: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  /** Última mensagem dela no direct: abre a janela de 24 h da Meta. */
  lastDmAt: string | null;
  sourceFlowId: string | null;
  /** Nome do fluxo de onde ela veio ("veio por"). */
  sourceFlowName: string | null;
};

export type AtendimentoDaPessoaDto = {
  id: string;
  flowId: string;
  flowName: string | null;
  sourceKind: "comment" | "dm" | "story";
  matchedKeyword: string | null;
  status: "queued" | "active" | "done" | "stopped" | "failed";
  /** Já traduzido: a tela não conhece os códigos. */
  errorText: string;
  startedAt: string;
};

/** O que a pessoa logada pode fazer em Pessoas (decidido no servidor, em `pessoas-acesso.ts`). */
export type AcessoDto = {
  somenteLeitura: boolean;
  /** Só com o add-on cancelado: quando as fichas somem (30 dias depois). */
  fichasSomemEm: string | null;
  podeApagar: boolean;
  podeExportar: boolean;
};

export type ListaDePessoas = { pessoas: PessoaDto[]; total: number; pagina: number; tamanho: number; acesso: AcessoDto };
export type FichaDaPessoa = { pessoa: PessoaDto; atendimentos: AtendimentoDaPessoaDto[] };
