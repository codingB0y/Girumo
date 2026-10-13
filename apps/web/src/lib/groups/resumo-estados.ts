import { dayBR, dayBROf } from "@/lib/date-br";
import type { EstadoGrupo, RegraDestino } from "@/lib/groups/estado";

/**
 * Apresentação dos estados dos grupos de uma campanha: a faixa e a lista da aba Grupos (PR 4)
 * e, no PR 5, o seletor de destino. O ESTADO e as REGRAS chegam prontos do SQL
 * (`campaign_group_states`, spec §4); aqui só se conta e se escreve frase.
 */

export type ContagemEstados = {
  lotado: number;
  enchendo: number;
  fila: number;
  vazio: number;
  membros: number;
};

/** Resposta de `GET /api/campanhas/[slug]/grupos/estados` (contratos §4). */
export type EstadosDaCampanha = {
  grupos: EstadoGrupo[];
  contagem: ContagemEstados;
  regras: Record<RegraDestino, number>;
};

export function resumirEstados(grupos: EstadoGrupo[]): {
  contagem: ContagemEstados;
  regras: Record<RegraDestino, number>;
} {
  const quantos = (cumpre: (g: EstadoGrupo) => boolean) => grupos.filter(cumpre).length;
  return {
    // Literais com todas as chaves: estado novo sem contador é erro de compilação, não NaN.
    contagem: {
      lotado: quantos((g) => g.estado === "lotado"),
      enchendo: quantos((g) => g.estado === "enchendo"),
      fila: quantos((g) => g.estado === "fila"),
      vazio: quantos((g) => g.estado === "vazio"),
      membros: grupos.reduce((soma, g) => soma + g.membros, 0),
    },
    // Lido de naRegra, nunca do estado: a regra mora numa função SQL só.
    regras: {
      menos_enchendo: quantos((g) => g.naRegra.menos_enchendo),
      lotados: quantos((g) => g.naRegra.lotados),
      com_gente: quantos((g) => g.naRegra.com_gente),
    },
  };
}

const UM_DIA_MS = 86_400_000;

/** "hoje", "ontem" ou "há N dias", em dias de Brasília: às 21h de SP o UTC já virou o dia. */
export function diasAtras(iso: string, agora: Date): string {
  const dia = dayBROf(iso);
  if (!dia) return "";
  const dias = Math.round((Date.parse(dayBR(agora)) - Date.parse(dia)) / UM_DIA_MS);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

/** O mesmo teste de convite do "disponível" do SQL e de `isGroupAvailable`. */
const CONVITE = /^https?:\/\/\S+$/;

/**
 * Para quem o link vai quando o grupo que está enchendo lotar: reabertos primeiro, depois a
 * ordem do pool (a ordem de `app.estados_da_campanha`).
 *
 * ponytail: repete o "disponível" do SQL (admin + convite; fora do lotado a contagem já está
 * abaixo do limiar) só para escrever "volta para o 13" e "Pausado". O estado de cada linha
 * continua vindo do banco. Se o SQL ganhar condição nova de disponível, esta frase pode errar o
 * número; aí subir `proximo` para `campaign_group_states`.
 */
export function proximoDoLink(grupos: EstadoGrupo[]): EstadoGrupo | null {
  const candidatos = [...grupos]
    .sort((a, b) => a.posicao - b.posicao)
    .filter((g) => (g.estado === "fila" || g.estado === "vazio") && g.isAdmin && CONVITE.test(g.inviteUrl ?? ""));
  return candidatos.find((g) => g.reabertoEm !== null) ?? candidatos[0] ?? null;
}

export type FraseDoLink =
  | { tipo: "parado" }
  | { tipo: "enchendo"; nome: string; reaberto: string | null; voltaPara: number | null };

/** "O link está mandando gente para X — reaberto ontem, tem prioridade. Quando ele lotar, volta para o 13." */
export function fraseDoLink(grupos: EstadoGrupo[], agora: Date): FraseDoLink {
  const enchendo = grupos.find((g) => g.estado === "enchendo");
  if (!enchendo) return { tipo: "parado" };
  if (!enchendo.reabertoEm) return { tipo: "enchendo", nome: enchendo.nome, reaberto: null, voltaPara: null };
  return {
    tipo: "enchendo",
    nome: enchendo.nome,
    reaberto: diasAtras(enchendo.reabertoEm, agora),
    voltaPara: proximoDoLink(grupos)?.posicao ?? null,
  };
}

/** A coluna Detalhe do mockup. `switch` sem `return` final: estado novo é erro de `tsc`. */
export function detalheDoGrupo(g: EstadoGrupo, grupos: EstadoGrupo[], agora: Date): string {
  switch (g.estado) {
    case "lotado": {
      const quando = g.lotadoEm ? `Lotou ${diasAtras(g.lotadoEm, agora)}` : "Lotado";
      return `${quando} · ${g.lotadoPor === "manual" ? "marcado à mão" : "automático"}`;
    }
    case "enchendo":
      return g.reabertoEm
        ? `Reaberto ${diasAtras(g.reabertoEm, agora)} · prioridade no link`
        : "Recebendo quem clica no link";
    case "fila":
    case "vazio": {
      if (!g.isAdmin) return "Nosso número não é admin: o link pula este grupo";
      if (!CONVITE.test(g.inviteUrl ?? "")) return "Sem convite: o link pula este grupo";
      if (g.estado === "vazio") return "Só o nosso número";
      const enchendo = grupos.find((e) => e.estado === "enchendo");
      if (enchendo?.reabertoEm && g.reabertoEm === null && proximoDoLink(grupos)?.groupId === g.groupId) {
        return `Pausado: volta a encher quando o ${enchendo.posicao} lotar`;
      }
      return "Aguardando a vez";
    }
  }
}
