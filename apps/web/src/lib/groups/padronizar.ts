/**
 * "Padronizar nomes e sequência" (spec 2026-10-10 §6.7, D9). Funções PURAS —
 * sem Supabase e sem `server-only`: a rota usa para decidir o que entra na fila,
 * e a tela usa as MESMAS para a prévia. O "Mudam de nome" que o lojista lê antes
 * de clicar é, por construção, o número de jobs que o servidor cria.
 */

import type { ConflitoDeGrupo } from "@/lib/campaigns/conflito-grupo";
import type { EstadoDoGrupo, EstadoGrupo } from "@/lib/groups/estado";

/**
 * O WhatsApp corta o nome do grupo em 100. 90 deixa espaço para " 999".
 * Conta em unidades UTF-16 (`.length`, emoji = 2): é o lado conservador — seja
 * qual for a conta do WhatsApp, o nome nunca passa de 100 nem perde o número.
 */
export const MAX_BASE = 90;

/** Linha de `GET /api/campanhas/conflitos` (contrato §4, PR 6). */
export type Conflito = ConflitoDeGrupo;

/** Um renome a enfileirar: entra direto em `buildSubjectJobs`. */
export type Renome = { groupId: string; whatsappGroupId: string; subject: string };

/** O que acontece com o grupo numa posição da sequência. */
export type Decisao = "muda" | "certo" | "conflito" | "sem_admin";

export const NOTA_DA_DECISAO: Record<Decisao, string> = {
  muda: "",
  certo: "já está certo",
  conflito: "fica igual · em 2 campanhas",
  sem_admin: "fica igual · não somos admin",
};

const ORDEM_DO_ESTADO: Record<EstadoDoGrupo, number> = { lotado: 0, enchendo: 1, fila: 2, vazio: 3 };

/** Nome do grupo na posição `indice` (base 0) da sequência. */
export function nomeNaPosicao(base: string, indice: number): string {
  return `${base} ${indice + 1}`;
}

/**
 * Sugestão de ordem (D9): lotados do mais cheio para o menos cheio; o que está
 * enchendo; fila do mais cheio para o menos cheio; vazios. Empate — e os vazios
 * entre si — ficam na posição atual.
 */
export function ordemPadrao(estados: readonly EstadoGrupo[]): string[] {
  return [...estados]
    .sort(
      (a, b) =>
        ORDEM_DO_ESTADO[a.estado] - ORDEM_DO_ESTADO[b.estado] ||
        (a.estado === "vazio" ? 0 : b.membros - a.membros) ||
        a.posicao - b.posicao,
    )
    .map((g) => g.whatsappGroupId);
}

/**
 * Ordem com que a tela abre. Campanha nunca padronizada: a sugestão. Já
 * padronizada: a ordem salva (posição do pool) — "depois a ordem fica fixa" (D9),
 * e reabrir a tela não pode embaralhar o que o lojista ajustou com as setas.
 */
export function ordemInicial(
  estados: readonly EstadoGrupo[],
  growTemplate: Record<string, unknown> | null | undefined,
): string[] {
  if (typeof growTemplate?.padronizadoEm === "string") {
    return [...estados].sort((a, b) => a.posicao - b.posicao).map((g) => g.whatsappGroupId);
  }
  return ordemPadrao(estados);
}

/** Quebra de linha, tab e afins — o que o celular cola junto sem a pessoa ver. */
function temControle(texto: string): boolean {
  for (let i = 0; i < texto.length; i += 1) {
    const code = texto.charCodeAt(i);
    if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}

export function validarBase(base: unknown): { ok: true; base: string } | { ok: false; error: string } {
  const limpa = typeof base === "string" ? base.trim() : "";
  if (!limpa) return { ok: false, error: "Escreva o nome base." };
  if (temControle(limpa)) return { ok: false, error: "O nome base não pode ter quebra de linha." };
  if (limpa.includes("{n}")) {
    return { ok: false, error: "Tire o {n} do nome: o número entra sozinho no fim." };
  }
  if (limpa.length > MAX_BASE) {
    return { ok: false, error: `O nome base pode ter até ${MAX_BASE} caracteres (emoji conta como 2).` };
  }
  return { ok: true, base: limpa };
}

/**
 * A regra única. Conflito antes de admin: grupo em duas campanhas fica parado até
 * o lojista escolher onde ele mora, sejamos admin ou não.
 */
function decidir(grupo: EstadoGrupo, indice: number, base: string, conflitos: ReadonlySet<string>): Decisao {
  if (conflitos.has(grupo.whatsappGroupId)) return "conflito";
  if (!grupo.isAdmin) return "sem_admin";
  return grupo.nome === nomeNaPosicao(base, indice) ? "certo" : "muda";
}

/**
 * Um renome por grupo cujo nome do WhatsApp (`groups.name`) difere de
 * "<base> <posição>". Grupo já certo não vira job: renomear para o mesmo nome
 * gastaria uma janela anti-ban e ainda mostraria "Você mudou o nome do grupo".
 * JID sem estado (órfão) ocupa a posição mas não vira job.
 */
export function planejarRenomes(input: {
  ordem: readonly string[];
  base: string;
  estados: readonly EstadoGrupo[];
  conflitos: ReadonlySet<string>;
}): Renome[] {
  const porJid = new Map(input.estados.map((g) => [g.whatsappGroupId, g]));
  const renomes: Renome[] = [];
  input.ordem.forEach((jid, indice) => {
    const grupo = porJid.get(jid);
    if (!grupo || decidir(grupo, indice, input.base, input.conflitos) !== "muda") return;
    renomes.push({ groupId: grupo.groupId, whatsappGroupId: jid, subject: nomeNaPosicao(input.base, indice) });
  });
  return renomes;
}

/**
 * Valida a ordem que veio da tela contra a lista que ela estava vendo
 * (`esperado` = `campaign_groups.group_ids` no carregamento) e acrescenta, no fim
 * e na ordem do pool, os JIDs que a tela não mostra (sem linha em `groups`). O
 * resultado é permutação SEM REPETIÇÃO do conjunto — o que `reordenar_campanha`
 * grava.
 */
export function completarOrdem(
  ordem: readonly string[],
  esperado: readonly string[],
): { ok: true; ordem: string[] } | { ok: false; error: string } {
  if (esperado.length === 0) return { ok: false, error: "Esta campanha ainda não tem grupos." };
  const doPool = new Set(esperado);
  const vistos = new Set<string>();
  for (const jid of ordem) {
    if (!doPool.has(jid) || vistos.has(jid)) {
      return { ok: false, error: "A ordem tem grupo repetido ou que não é desta campanha." };
    }
    vistos.add(jid);
  }
  return { ok: true, ordem: [...ordem, ...[...doPool].filter((jid) => !vistos.has(jid))] };
}

/**
 * `grow_template` depois do Padronizar: molde "<base> {n}" e `padronizadoEm`
 * (o `nextSeq` conta só a fila depois dessa data). MERGE, nunca replace — sem
 * `subjectPattern` o auto-grow desliga; sem `desc`/`mediaId` o próximo grupo
 * nasce sem a identidade aplicada.
 */
export function padronizarGrowTemplate(
  atual: Record<string, unknown> | null,
  base: string,
  agora: string,
): Record<string, unknown> {
  return { ...(atual ?? {}), subjectPattern: `${base} {n}`, padronizadoEm: agora };
}

/** Base com que a tela abre: a do molde "<base> {n}", senão o nome da campanha. */
export function baseInicial(
  nomeDaCampanha: string,
  growTemplate: Record<string, unknown> | null | undefined,
): string {
  const bruto = growTemplate?.subjectPattern;
  const molde = typeof bruto === "string" ? bruto.trim() : "";
  const sufixo = " {n}";
  return molde.endsWith(sufixo) ? molde.slice(0, -sufixo.length).trim() : nomeDaCampanha.trim();
}

/** Os conflitos que tocam ESTA campanha, para o aviso amarelo da tela. */
export function conflitosDaCampanha(
  conflitos: readonly Conflito[],
  campanhaId: string,
): { jids: Set<string>; nomes: string[]; outras: string[] } {
  const daqui = conflitos.filter((c) => c.campanhas.some((camp) => camp.id === campanhaId));
  return {
    jids: new Set(daqui.map((c) => c.whatsappGroupId)),
    nomes: daqui.map((c) => c.nome),
    outras: [
      ...new Set(daqui.flatMap((c) => c.campanhas.filter((camp) => camp.id !== campanhaId).map((camp) => camp.name))),
    ],
  };
}

/** Seta ↑ (−1) e ↓ (+1). Fora das pontas devolve uma cópia igual. */
export function mover(ordem: readonly string[], indice: number, delta: -1 | 1): string[] {
  const nova = [...ordem];
  const alvo = indice + delta;
  if (indice < 0 || indice >= nova.length || alvo < 0 || alvo >= nova.length) return nova;
  [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
  return nova;
}

export type LinhaDoPadrao = {
  jid: string;
  /** Posição na sequência, a partir de 1. */
  numero: number;
  atual: string;
  novo: string;
  decisao: Decisao;
  membros: number;
  estado: EstadoDoGrupo;
};

export type ResumoDoPadrao = { linhas: LinhaDoPadrao[]; mudam: number; jaCertos: number; proximo: string };

/**
 * A prévia da tela. `tamanhoDoPool` é `group_ids.length` — o mesmo `poolSize` que
 * o `nextSeq` usa —, então "Próximo grupo criado sozinho" é o nome que o
 * auto-grow vai dar.
 */
export function resumoDoPadrao(input: {
  ordem: readonly string[];
  base: string;
  estados: readonly EstadoGrupo[];
  conflitos: ReadonlySet<string>;
  tamanhoDoPool: number;
}): ResumoDoPadrao {
  const porJid = new Map(input.estados.map((g) => [g.whatsappGroupId, g]));
  const linhas: LinhaDoPadrao[] = [];
  input.ordem.forEach((jid, indice) => {
    const grupo = porJid.get(jid);
    if (!grupo) return;
    const decisao = decidir(grupo, indice, input.base, input.conflitos);
    const ficaIgual = decisao === "conflito" || decisao === "sem_admin";
    linhas.push({
      jid,
      numero: indice + 1,
      atual: grupo.nome,
      novo: ficaIgual ? grupo.nome : nomeNaPosicao(input.base, indice),
      decisao,
      membros: grupo.membros,
      estado: grupo.estado,
    });
  });
  return {
    linhas,
    mudam: linhas.filter((l) => l.decisao === "muda").length,
    jaCertos: linhas.filter((l) => l.decisao === "certo").length,
    proximo: nomeNaPosicao(input.base, Math.max(input.tamanhoDoPool, input.ordem.length)),
  };
}
