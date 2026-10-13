/**
 * Estado de um grupo DENTRO da sua campanha, como `public.campaign_group_states`
 * devolve (spec "postar por grupo" §3 e §5.2).
 *
 * O banco é o único lugar que decide lotado/enchendo/fila/vazio e quem entra em
 * cada regra de destino (spec §4): o link `/r/`, a aba Grupos e o seletor do
 * Postar leem daqui e nunca recalculam. Este arquivo só traduz a linha da RPC e
 * dá nome às coisas na tela.
 *
 * Sem `server-only` de propósito: a tela importa os tipos e os rótulos.
 */

export type EstadoDoGrupo = "lotado" | "enchendo" | "fila" | "vazio";
export type RegraDestino = "menos_enchendo" | "lotados" | "com_gente";

/** Ordem dos atalhos na tela (D6): o padrão primeiro. */
export const REGRAS: readonly RegraDestino[] = ["menos_enchendo", "lotados", "com_gente"];

export type EstadoGrupo = {
  posicao: number;
  groupId: string;
  whatsappGroupId: string;
  nome: string;
  membros: number;
  capacidade: number;
  isAdmin: boolean;
  inviteUrl: string | null;
  lotadoEm: string | null;
  lotadoPor: "auto" | "manual" | null;
  reabertoEm: string | null;
  avisoLotouEm: string | null;
  estado: EstadoDoGrupo;
  podeReabrir: boolean;
  naRegra: Record<RegraDestino, boolean>;
};

/** Linha de `public.campaign_group_states`, na ordem das colunas do contrato. */
export type EstadoRow = {
  posicao: number;
  group_id: string;
  whatsapp_group_id: string;
  name: string;
  members: number;
  capacity: number;
  is_admin: boolean;
  invite_url: string | null;
  lotado_em: string | null;
  lotado_por: "auto" | "manual" | null;
  reaberto_em: string | null;
  aviso_lotou_em: string | null;
  estado: EstadoDoGrupo;
  pode_reabrir: boolean;
  na_regra_menos_enchendo: boolean;
  na_regra_lotados: boolean;
  na_regra_com_gente: boolean;
};

export function estadoFromRow(row: EstadoRow): EstadoGrupo {
  return {
    // `Number` porque inteiro grande pode chegar como texto no JSON do PostgREST.
    posicao: Number(row.posicao),
    groupId: row.group_id,
    whatsappGroupId: row.whatsapp_group_id,
    nome: row.name,
    membros: Number(row.members),
    capacidade: Number(row.capacity),
    isAdmin: row.is_admin === true,
    inviteUrl: row.invite_url ?? null,
    lotadoEm: row.lotado_em ?? null,
    lotadoPor: row.lotado_por ?? null,
    reabertoEm: row.reaberto_em ?? null,
    avisoLotouEm: row.aviso_lotou_em ?? null,
    estado: row.estado,
    podeReabrir: row.pode_reabrir === true,
    naRegra: {
      menos_enchendo: row.na_regra_menos_enchendo === true,
      lotados: row.na_regra_lotados === true,
      com_gente: row.na_regra_com_gente === true,
    },
  };
}

export const ROTULO_ESTADO: Record<EstadoDoGrupo, string> = {
  lotado: "Lotado",
  enchendo: "Enchendo agora",
  fila: "Na fila",
  vazio: "Vazio",
};

export const ROTULO_REGRA: Record<RegraDestino, string> = {
  menos_enchendo: "Todos menos o que está enchendo",
  lotados: "Só lotados",
  com_gente: "Todos com gente",
};

export function isRegraDestino(v: unknown): v is RegraDestino {
  return typeof v === "string" && (REGRAS as readonly string[]).includes(v);
}
