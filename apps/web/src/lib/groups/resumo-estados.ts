import { dayBR, dayBROf } from "@/lib/date-br";
import type { EstadoDoGrupo, EstadoGrupo, RegraDestino } from "@/lib/groups/estado";
import { isUsableInvite } from "@/lib/links/resolve-click-target";
import type { DestinoDoLink } from "@/lib/painel/destino-do-link";

/**
 * Apresentação dos estados dos grupos de uma campanha: a faixa e a lista da aba Grupos (PR 4)
 * e, no PR 5, o seletor de destino. O ESTADO e as REGRAS chegam prontos do SQL
 * (`campaign_group_states`, spec §4); aqui só se conta e se escreve frase.
 */

/** Um contador por estado, mais os membros: `{ lotado, enchendo, fila, vazio, membros }` (contratos §4). */
export type ContagemEstados = Record<EstadoDoGrupo, number> & { membros: number };

/** Resposta de `GET /api/campanhas/[slug]/grupos/estados` (contratos §4). */
export type EstadosDaCampanha = {
  grupos: EstadoGrupo[];
  contagem: ContagemEstados;
  regras: Record<RegraDestino, number>;
  /** JIDs do pool que são pai ou Avisos de comunidade: ficam fora dos estados de propósito. */
  estruturaDeComunidade: string[];
};

export function resumirEstados(grupos: EstadoGrupo[]): {
  contagem: ContagemEstados;
  regras: Record<RegraDestino, number>;
} {
  const quantos = (cumpre: (g: EstadoGrupo) => boolean) => grupos.filter(cumpre).length;
  return {
    // `ContagemEstados` é `Record<EstadoDoGrupo, …>`: estado novo sem contador aqui é erro de
    // compilação, não NaN.
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

/**
 * Para quem o link vai quando o grupo que está enchendo lotar: reabertos primeiro, depois a
 * ordem do pool (a ordem de `app.estados_da_campanha`).
 *
 * ponytail: repete o "disponível" do SQL (admin + convite, pelo `isUsableInvite` do `/r/`, sem
 * caixa como o `~*` do SQL; fora do lotado a contagem já está abaixo do limiar) só para escrever
 * "volta para o 13" e "Pausado". O estado de cada linha continua vindo do banco. Se o SQL ganhar condição nova de disponível, esta frase pode errar o
 * número; aí subir `proximo` para `campaign_group_states`.
 */
export function proximoDoLink(grupos: EstadoGrupo[]): EstadoGrupo | null {
  const candidatos = [...grupos]
    .sort((a, b) => a.posicao - b.posicao)
    .filter((g) => (g.estado === "fila" || g.estado === "vazio") && g.isAdmin && isUsableInvite(g.inviteUrl));
  return candidatos.find((g) => g.reabertoEm !== null) ?? candidatos[0] ?? null;
}

export type FraseDoLink =
  | { tipo: "parado"; texto: string }
  | { tipo: "enchendo"; nome: string; reaberto: string | null; voltaPara: number | null };

/**
 * "O link está mandando gente para X — reaberto ontem, tem prioridade. Quando ele lotar, volta para o 13."
 *
 * Parado ou mandando gente quem decide é `destino` (`destinoDoLink`, o mesmo da aba Link e cliques
 * e do `/r/`): campanha encerrada para o link mesmo com um `enchendo` no banco, e as duas abas não
 * podem discordar. Parado leva o texto de lá, palavra por palavra.
 */
export function fraseDoLink(destino: DestinoDoLink, grupos: EstadoGrupo[], agora: Date): FraseDoLink {
  const alvo = destino.grupo;
  if (!alvo) return { tipo: "parado", texto: destino.parado?.texto ?? "Nenhum grupo agora." };
  if (!alvo.reabertoEm) return { tipo: "enchendo", nome: alvo.nome, reaberto: null, voltaPara: null };
  return {
    tipo: "enchendo",
    nome: alvo.nome,
    reaberto: diasAtras(alvo.reabertoEm, agora),
    voltaPara: proximoDoLink(grupos)?.posicao ?? null,
  };
}

/**
 * Grupo do pool cuja linha em `groups` sumiu (o número deixou de ser admin e o sync apagou) não
 * volta de `campaign_group_states`: a lista e a faixa o omitem, e o contador da aba o conta.
 */
export function avisoForaDaLista(noPool: number, naLista: number): string | null {
  const faltam = noPool - naLista;
  if (faltam <= 0) return null;
  return faltam === 1
    ? "1 grupo desta campanha não aparece aqui: não está mais na sua conta. Tire em Configurar."
    : `${faltam.toLocaleString("pt-BR")} grupos desta campanha não aparecem aqui: não estão mais na sua conta. Tire em Configurar.`;
}

/** Pai e Avisos de comunidade saem do pool de propósito: dizer por que somem da lista. */
export function avisoEstruturaDeComunidade(quantos: number): string | null {
  if (quantos <= 0) return null;
  return quantos === 1
    ? "1 grupo desta campanha é estrutura de comunidade (Avisos ou grupo principal): fica fora desta lista e o link não manda gente para ele."
    : `${quantos.toLocaleString("pt-BR")} grupos desta campanha são estrutura de comunidade (Avisos ou grupo principal): ficam fora desta lista e o link não manda gente para eles.`;
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
      if (!isUsableInvite(g.inviteUrl)) return "Sem convite: o link pula este grupo";
      if (g.estado === "vazio") return "Só o nosso número";
      const enchendo = grupos.find((e) => e.estado === "enchendo");
      if (enchendo?.reabertoEm && g.reabertoEm === null && proximoDoLink(grupos)?.groupId === g.groupId) {
        return `Pausado: volta a encher quando o ${enchendo.posicao} lotar`;
      }
      return "Aguardando a vez";
    }
  }
}
