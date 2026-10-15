/**
 * Apresentação do seletor "Para quais grupos" (spec postar-por-grupo §6.5).
 * Pura e sem `server-only`. A pertinência a cada regra vem PRONTA do banco
 * (`naRegra`, de `app.grupo_na_regra`): aqui só se conta e se escreve o que já
 * veio marcado — nunca se recalcula regra pelo estado (spec §4).
 */
import type { EstadoGrupo, RegraDestino } from "@/lib/groups/estado";
import { frasePlural } from "@/lib/painel/disparos";
import { DESTINO_PADRAO, type Destino } from "./destino";

/** JIDs que o destino alcança, na ordem do pool. */
export function selecionados(grupos: readonly EstadoGrupo[], destino: Destino): string[] {
  if ("regra" in destino) {
    const regra = destino.regra;
    return grupos.filter((g) => g.naRegra[regra]).map((g) => g.whatsappGroupId);
  }
  const fixa = new Set(destino.grupos);
  return grupos.filter((g) => fixa.has(g.whatsappGroupId)).map((g) => g.whatsappGroupId);
}

/** Clique numa caixa. A partir de uma regra, mexer na lista vira lista fixa (D8). */
export function alternar(grupos: readonly EstadoGrupo[], destino: Destino, jid: string): Destino {
  const marcados = new Set(selecionados(grupos, destino));
  if (marcados.has(jid)) marcados.delete(jid);
  else marcados.add(jid);
  return { grupos: grupos.map((g) => g.whatsappGroupId).filter((j) => marcados.has(j)) };
}

/** O grupo que está enchendo, quando o destino o inclui: vira o aviso amarelo (D6). */
export function avisoEnchendo(grupos: readonly EstadoGrupo[], destino: Destino): EstadoGrupo | null {
  const marcados = new Set(selecionados(grupos, destino));
  return grupos.find((g) => g.estado === "enchendo" && marcados.has(g.whatsappGroupId)) ?? null;
}

export function resumoDoDestino(grupos: readonly EstadoGrupo[], destino: Destino): { grupos: number; pessoas: number } {
  const marcados = new Set(selecionados(grupos, destino));
  const doDestino = grupos.filter((g) => marcados.has(g.whatsappGroupId));
  return { grupos: doDestino.length, pessoas: doDestino.reduce((soma, g) => soma + Math.max(0, g.membros), 0) };
}

/** "13 grupos · 9.736 pessoas". */
export function fraseResumo(r: { grupos: number; pessoas: number }): string {
  return `${frasePlural(r.grupos, "grupo", "grupos")} · ${frasePlural(r.pessoas, "pessoa", "pessoas")}`;
}

/** D7: vazio fica fora de todo atalho, mas dá para marcar à mão. */
export function fraseVazios(grupos: readonly EstadoGrupo[], destino: Destino): string | null {
  const marcados = new Set(selecionados(grupos, destino));
  const fora = grupos.filter((g) => g.estado === "vazio" && !marcados.has(g.whatsappGroupId)).length;
  return fora === 0 ? null : `${frasePlural(fora, "vazio fica", "vazios ficam")} de fora — marque à mão se quiser.`;
}

export const FRASE_DA_REGRA: Record<RegraDestino, string> = {
  menos_enchendo:
    "A lista é refeita na hora do envio: grupo que lotar até lá entra; o que estiver enchendo na hora fica de fora.",
  lotados: "A lista é refeita na hora do envio: só os grupos lotados naquele momento.",
  com_gente: "A lista é refeita na hora do envio: todos os grupos com gente, inclusive o que estiver enchendo.",
};

export function fraseListaFixa(n: number): string {
  if (n === 0) return "Marque ao menos um grupo.";
  if (n === 1) return "Você mexeu na lista: sai só neste grupo, mesmo que ele lote ou comece a encher até lá.";
  return `Você mexeu na lista: sai exatamente nestes ${frasePlural(n, "grupo", "grupos")}, mesmo que algum lote ou comece a encher até lá.`;
}

/** A escolha vale só para a campanha em que foi feita (folha e Disparos trocam de campanha). */
export function destinoDaCampanha(escolha: { slug: string; destino: Destino } | null, slug: string): Destino {
  return escolha && escolha.slug === slug ? escolha.destino : DESTINO_PADRAO;
}
