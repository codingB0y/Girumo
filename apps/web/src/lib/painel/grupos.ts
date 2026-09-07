import { GROUP_FULL_RATIO } from "@/lib/links/resolve-click-target";
import type { Group } from "@/lib/mock-data";

/**
 * A prateleira e o romaneio da tela de Grupos (spec 12.5 da Vitrine Aberta).
 *
 * O que dá pra ler sem navegador mora aqui: lotação, estado da caixa, os totais
 * do romaneio e qual grupo está prestes a lotar. A tela só desenha.
 */

/** Acima disto a caixa ganha o contorno de aviso: ainda cabe gente, mas pouca. */
export const QUASE_LOTADO = 0.85;

export type EstadoDoGrupo = "cheio" | "quase" | "ativo" | "sem_convite";

/**
 * Número para a tela. `null`/`undefined`/`NaN` viram "0" em vez de derrubar o
 * render: `null.toLocaleString()` é TypeError, e como a lista inteira sai de um
 * `map`, um grupo torto apagaria os outros noventa.
 */
export function numero(valor: number | null | undefined): string {
  return Number.isFinite(valor) ? (valor as number).toLocaleString("pt-BR") : "0";
}

/** 0 a 1. Capacidade ausente ou zero vale 0 — nunca Infinity nem NaN na barra. */
export function lotacao(membros: number, capacidade: number): number {
  if (!Number.isFinite(membros) || !Number.isFinite(capacidade) || capacidade <= 0) return 0;
  return Math.min(1, Math.max(0, membros / capacidade));
}

export function estadoDoGrupo(grupo: Group): EstadoDoGrupo {
  if (!grupo.inviteUrl) return "sem_convite";
  const ocupacao = lotacao(grupo.members, grupo.capacity);
  if (ocupacao >= GROUP_FULL_RATIO) return "cheio";
  if (ocupacao >= QUASE_LOTADO) return "quase";
  return "ativo";
}

export type Romaneio = {
  grupos: number;
  pessoas: number;
  vagas: number;
  lotados: number;
  semConvite: number;
  ativos: number;
};

/**
 * O total que fica ao lado da prateleira. "Ativos" inclui os que estão quase
 * lotando: quem ainda recebe gente é ativo, e o quase aparece como aviso à
 * parte, não como categoria da contagem.
 */
export function romaneio(grupos: readonly Group[]): Romaneio {
  let pessoas = 0;
  let vagas = 0;
  let lotados = 0;
  let semConvite = 0;

  for (const g of grupos) {
    const membros = Number.isFinite(g.members) ? Math.max(0, g.members) : 0;
    const capacidade = Number.isFinite(g.capacity) ? Math.max(0, g.capacity) : 0;
    pessoas += membros;
    vagas += Math.max(0, capacidade - membros);
    const estado = estadoDoGrupo(g);
    if (estado === "cheio") lotados += 1;
    if (estado === "sem_convite") semConvite += 1;
  }

  return {
    grupos: grupos.length,
    pessoas,
    vagas,
    lotados,
    semConvite,
    ativos: grupos.length - lotados - semConvite,
  };
}

/**
 * O grupo que a lojista precisa olhar hoje: o mais cheio que ainda não lotou.
 * É o aviso do bloco 3 ("faltam 12"), não uma lista.
 */
export function prestesALotar(grupos: readonly Group[]): { grupo: Group; faltam: number } | null {
  let escolhido: Group | null = null;
  let maior = 0;

  for (const g of grupos) {
    if (estadoDoGrupo(g) !== "quase") continue;
    const ocupacao = lotacao(g.members, g.capacity);
    // Empate desempata pelo nome, igual à ordenação: senão o aviso troca de
    // grupo entre um sync e outro sem a lotação ter mudado.
    if (ocupacao > maior || (ocupacao === maior && escolhido && g.name.localeCompare(escolhido.name, "pt-BR") < 0)) {
      maior = ocupacao;
      escolhido = g;
    }
  }

  if (!escolhido) return null;
  const faltam = escolhido.capacity - escolhido.members;
  return { grupo: escolhido, faltam: Number.isFinite(faltam) ? Math.max(0, faltam) : 0 };
}

/** Mais cheio primeiro; empate desempata pelo nome, pra ordem não dançar entre renders. */
export function maisCheioPrimeiro(grupos: readonly Group[]): Group[] {
  return [...grupos].sort((a, b) => {
    const diferenca = lotacao(b.members, b.capacity) - lotacao(a.members, a.capacity);
    return diferenca !== 0 ? diferenca : a.name.localeCompare(b.name, "pt-BR");
  });
}

/**
 * Até onde a contagem é verificável (spec: "conferida há 2 h pelo próprio
 * WhatsApp"). Sem carimbo devolve vazio: quem chama escreve o texto, porque
 * "nunca conferido" não é a mesma frase que "conferido agora".
 */
export function conferidoHa(syncedAt: string | null | undefined, agora: Date): string {
  if (!syncedAt) return "";
  const quando = new Date(syncedAt);
  if (Number.isNaN(quando.getTime())) return "";

  const minutos = Math.floor((agora.getTime() - quando.getTime()) / 60_000);
  if (minutos < 0) return "agora";
  if (minutos < 2) return "agora";
  if (minutos < 60) return `há ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;

  const dias = Math.floor(horas / 24);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

/** Quantos grupos caem em cada filtro do segmentado (bloco 4). Deriva do romaneio já contado. */
export function contagensDosFiltros(total: Romaneio): {
  todos: number;
  ativos: number;
  cheios: number;
  semConvite: number;
} {
  return { todos: total.grupos, ativos: total.ativos, cheios: total.lotados, semConvite: total.semConvite };
}
