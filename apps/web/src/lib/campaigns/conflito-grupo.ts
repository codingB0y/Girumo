/**
 * Um grupo, uma campanha (spec 2026-10-10-postar-por-grupo §5.8 e §6.6, D4) — o lado TS do
 * trigger `campaign_groups_grupo_exclusivo`. Puro e sem `server-only`: o seletor de grupos, a
 * tela de conflitos, a faixa da aba Grupos, as rotas e o espelho de comunidade importam daqui.
 */

/** Linha de `GET /api/campanhas/conflitos` (contrato §4). */
export type ConflitoDeGrupo = {
  whatsappGroupId: string;
  nome: string;
  campanhas: Array<{ id: string; name: string; slug: string; posicao: number }>;
};

/** O que importa do corpo do 409 de POST/PATCH /api/campanhas (contrato §4). */
export type Conflito409 = { grupo: string; campanha: { id: string; name: string } };

const MENSAGEM_DO_TRIGGER =
  /grupo_em_outra_campanha:(.+):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JID_MAX = 200;

export const GRUPO_SAIU_DA_CAMPANHA = "Esse grupo não está mais nessa campanha. Recarregue a lista.";

/**
 * Lê `grupo_em_outra_campanha:<jid>:<id da outra>`. O JID vai até o ÚLTIMO `:` antes do uuid,
 * então JID com `:` no meio não quebra. `null` para qualquer outro erro.
 */
export function lerConflitoGrupo(mensagem: string): { jid: string; campanhaId: string } | null {
  const m = MENSAGEM_DO_TRIGGER.exec(mensagem);
  return m ? { jid: m[1], campanhaId: m[2].toLowerCase() } : null;
}

/** O corpo do 409 lido no cliente; `null` se não for o 409 de grupo (o 402 do plano também tem `error`). */
export function lerCorpo409(corpo: unknown): Conflito409 | null {
  if (!corpo || typeof corpo !== "object") return null;
  const { grupo, campanha } = corpo as { grupo?: unknown; campanha?: unknown };
  if (typeof grupo !== "string" || !campanha || typeof campanha !== "object") return null;
  const { id, name } = campanha as { id?: unknown; name?: unknown };
  if (typeof id !== "string" || typeof name !== "string") return null;
  return { grupo, campanha: { id, name } };
}

/** Texto do erro. O servidor não sabe o nome do grupo e manda `null`; o seletor sabe e completa. */
export function mensagemConflito(nomeDoGrupo: string | null, nomeDaCampanha: string): string {
  const quem = nomeDoGrupo ? `O grupo “${nomeDoGrupo}”` : "Um dos grupos";
  return `${quem} já está na campanha “${nomeDaCampanha}”. Cada grupo fica em uma campanha só — tire de lá primeiro.`;
}

type CampanhaComGrupos = { id: string; name: string; groupIds: readonly string[] };

/**
 * JID → nome da outra campanha, para travar no seletor. Espelha o trigger: só trava o que
 * ENTRARIA agora — grupo que a campanha já tem (inclusive conflito antigo) nunca trava, senão o
 * lojista não conseguiria desmarcá-lo. Na criação, `atual = { id: null, groupIds: [] }`.
 */
export function travasDoSeletor(
  campanhas: readonly CampanhaComGrupos[],
  atual: { id: string | null; groupIds: readonly string[] },
): Map<string, string> {
  const proprios = new Set(atual.groupIds);
  const travas = new Map<string, string>();
  for (const c of campanhas) {
    if (c.id === atual.id) continue;
    for (const jid of c.groupIds) {
      if (!proprios.has(jid) && !travas.has(jid)) travas.set(jid, c.name);
    }
  }
  return travas;
}

/**
 * O que o espelho da comunidade nativa grava em `group_ids`: o que o WhatsApp diz, MENOS os
 * grupos que já estão em outra campanha e ainda não estão nesta gaveta (o trigger recusaria a
 * escrita inteira). Quem chegou primeiro fica com o grupo; o que a gaveta já tinha continua.
 */
export function gruposDoEspelho(
  membros: readonly string[],
  campanhas: ReadonlyArray<{ id: string; groupIds: readonly string[] }>,
  gavetaId: string | null,
): string[] {
  const daGaveta = new Set(campanhas.find((c) => c.id === gavetaId)?.groupIds ?? []);
  const deOutras = new Set(campanhas.filter((c) => c.id !== gavetaId).flatMap((c) => c.groupIds));
  return membros.filter((jid) => daGaveta.has(jid) || !deOutras.has(jid));
}

/** Corpo de `POST /api/campanhas/conflitos` (`{ jid, ficaEm }`). */
export function lerEscolha(
  corpo: unknown,
): { ok: true; jid: string; ficaEm: string } | { ok: false; error: string } {
  const b = corpo && typeof corpo === "object" ? (corpo as Record<string, unknown>) : {};
  const jid = typeof b.jid === "string" ? b.jid.trim() : "";
  const ficaEm = typeof b.ficaEm === "string" ? b.ficaEm.trim().toLowerCase() : "";
  if (!jid || jid.length > JID_MAX) return { ok: false, error: "Grupo inválido." };
  if (!UUID.test(ficaEm)) return { ok: false, error: "Campanha inválida." };
  return { ok: true, jid, ficaEm };
}

/**
 * De quais campanhas o grupo sai para ficar em `ficaEm`. Recusa quando `ficaEm` não tem mais o
 * grupo — senão ele sairia de todas e não ficaria em nenhuma.
 */
export function planejarEscolha(
  campanhas: ReadonlyArray<{ id: string; group_ids: readonly string[] }>,
  escolha: { jid: string; ficaEm: string },
): { ok: true; tirarDe: string[] } | { ok: false; status: 404 | 409; error: string } {
  const fica = campanhas.find((c) => c.id === escolha.ficaEm);
  if (!fica) return { ok: false, status: 404, error: "Campanha não encontrada." };
  if (!fica.group_ids.includes(escolha.jid)) return { ok: false, status: 409, error: GRUPO_SAIU_DA_CAMPANHA };
  return {
    ok: true,
    tirarDe: campanhas.filter((c) => c.id !== fica.id && c.group_ids.includes(escolha.jid)).map((c) => c.id),
  };
}

/** Quantos conflitos ainda não têm escolha válida (uma das campanhas do próprio grupo). */
export function faltaEscolher(
  conflitos: readonly ConflitoDeGrupo[],
  escolhas: Readonly<Record<string, string>>,
): number {
  return conflitos.filter((c) => !c.campanhas.some((camp) => camp.id === escolhas[c.whatsappGroupId])).length;
}

/**
 * Faixa amarela da aba Grupos (mockup "Main"): quantos grupos DESTA campanha também estão em
 * outra, e os nomes das outras. `null` = nada a avisar.
 */
export function avisoDaCampanha(
  conflitos: readonly ConflitoDeGrupo[],
  campanhaId: string,
): { inicio: string; nomes: string } | null {
  const daCampanha = conflitos.filter((c) => c.campanhas.some((camp) => camp.id === campanhaId));
  if (daCampanha.length === 0) return null;
  const outras = [
    ...new Set(
      daCampanha.flatMap((c) => c.campanhas.filter((camp) => camp.id !== campanhaId).map((camp) => camp.name)),
    ),
  ];
  const n = daCampanha.length;
  const inicio = n === 1 ? "1 grupo desta campanha também está em" : `${n} grupos desta campanha também estão em`;
  return { inicio, nomes: juntarNomes(outras) };
}

function juntarNomes(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}
