/**
 * Regras puras da tela Início na Vitrine Aberta (spec 2026-09-07 e
 * research/direcao-d3.md, 12.3 e 12.4). Sem fetch: a tela passa os dados.
 */

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DIAS_LONGOS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DIA_MS = 24 * 60 * 60 * 1000;
const dois = (n: number) => String(n).padStart(2, "0");

/** "Sexta, 04 de setembro" (desktop) e "Sex, 04 de setembro" (mobile). */
export function cabecalhoDoDia(agora: Date): { titulo: string; tituloCurto: string } {
  const dia = `${dois(agora.getDate())} de ${MESES[agora.getMonth()]}`;
  return {
    titulo: `${DIAS_LONGOS[agora.getDay()]}, ${dia}`,
    tituloCurto: `${DIAS_CURTOS[agora.getDay()].replace(/^\w/, (c) => c.toUpperCase())}, ${dia}`,
  };
}

/** "qua 14:20"; com mais de 6 dias vira "02/09". */
export function diaHoraCurto(iso: string, agora: Date): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  if (agora.getTime() - d.getTime() > 6 * DIA_MS) return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;
  return `${DIAS_CURTOS[d.getDay()]} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** "0 entradas hoje · 4 na semana · último post qua 12:12". */
export function linhaDoDia(
  { hoje, semana, ultimoPost }: { hoje: number; semana: number; ultimoPost: string | null },
  agora: Date,
): string {
  const entradas = `${hoje} ${hoje === 1 ? "entrada" : "entradas"} hoje · ${semana} na semana`;
  const post = ultimoPost ? `último post ${diaHoraCurto(ultimoPost, agora)}` : "nenhum post ainda";
  return `${entradas} · ${post}`;
}

/** Dias que ainda faltam no mês depois de hoje (04/09 → 26). */
export function diasRestantesNoMes(agora: Date): number {
  const ultimo = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  return Math.max(0, ultimo - agora.getDate());
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

/** "91 grupos · 9.736 pessoas · 82.448 vagas" e o grupo mais perto de lotar (≥ 90%). */
export function resumoDoEstoque(grupos: readonly GrupoResumo[]): {
  grupos: number;
  pessoas: number;
  vagas: number;
  quaseCheio: GrupoResumo | null;
} {
  const pessoas = grupos.reduce((a, g) => a + (g.members ?? 0), 0);
  const capacidade = grupos.reduce((a, g) => a + (g.capacity ?? 0), 0);
  const quase = grupos
    .filter((g) => g.capacity > 0 && g.members / g.capacity >= 0.9)
    .sort((a, b) => b.members / b.capacity - a.members / a.capacity)[0];
  return { grupos: grupos.length, pessoas, vagas: Math.max(0, capacidade - pessoas), quaseCheio: quase ?? null };
}
