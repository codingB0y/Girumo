/**
 * Regras puras que sobraram da Início na Vitrine Aberta (a tela foi trocada pela
 * Início "Ao vivo") e que outras telas da Vitrine ainda usam. Sem fetch.
 */

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DIA_MS = 24 * 60 * 60 * 1000;
const dois = (n: number) => String(n).padStart(2, "0");

/** "qua 14:20"; com mais de 6 dias vira "02/09". */
export function diaHoraCurto(iso: string, agora: Date): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  if (agora.getTime() - d.getTime() > 6 * DIA_MS) return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;
  return `${DIAS_CURTOS[d.getDay()]} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** "R$ 10 mil", "20", "30", "40", "50 mil": cinco rótulos a 20/40/60/80/100% da meta. */
export function rotulosDaFita(meta: number): { posicao: number; texto: string }[] {
  const mil = (v: number) => {
    const n = v / 1000;
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  };
  return [1, 2, 3, 4, 5].map((k) => {
    const valor = (meta * k) / 5;
    const texto = k === 1 ? `R$ ${mil(valor)} mil` : k === 5 ? `${mil(valor)} mil` : mil(valor);
    return { posicao: k * 20, texto };
  });
}

/** Quantas marcas a fita ganha: uma a cada `passo` reais, no mínimo uma. */
export function marcasDaFita(meta: number, passo: number): number {
  if (!(meta > 0) || !(passo > 0)) return 1;
  return Math.max(1, Math.round(meta / passo));
}

/** "Josiane Moura" → "JM"; sem nome → "•". */
export function iniciais(nome?: string | null): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "•";
  return partes
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export type GrupoResumo = { id: string; whatsappGroupId?: string; name: string; members: number; capacity: number };

/** Pessoas e vagas dos grupos de uma campanha. `groupIds` casa por whatsapp id em prod e por uuid no seed. */
export function vagasDaCampanha(
  groupIds: readonly string[] | undefined,
  grupos: readonly GrupoResumo[],
): { pessoas: number; capacidade: number; lotacao: number } {
  const ids = new Set(groupIds ?? []);
  const meus = grupos.filter((g) => ids.has(g.id) || (g.whatsappGroupId ? ids.has(g.whatsappGroupId) : false));
  const pessoas = meus.reduce((a, g) => a + (g.members ?? 0), 0);
  const capacidade = meus.reduce((a, g) => a + (g.capacity ?? 0), 0);
  return { pessoas, capacidade, lotacao: capacidade > 0 ? Math.min(1, pessoas / capacidade) : 0 };
}
