import { timeAgo } from "@/lib/activity-feed";

/**
 * Regras puras da casca da Vitrine Aberta (spec 2026-09-07, 3.1 e 3.5):
 * o texto do ticker do letreiro e o romaneio do plano no rodapé do corredor.
 * Sem fetch aqui; os componentes buscam e passam os dados.
 */

export type Entrada = { nome?: string | null; grupo?: string | null; quando: string };
export type UltimoPost = { quando: string; enviados: number; total: number };
export type Ticker = { tipo: "entrada" | "post" | "vazio"; texto: string };

const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dois = (n: number) => String(n).padStart(2, "0");

/** "Josiane Maria Silva" → "Josiane M." (regra 6: nome completo só em Contatos). */
export function abreviaNome(nome?: string | null): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "Alguém";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[1][0].toUpperCase()}.`;
}

/**
 * Ticker troca só em entrada real; sem entrada em 24 h vira o último post
 * ("Último post qua 12:12 · 13/13 grupos"); sem nada, aponta o próximo passo.
 */
export function textoDoTicker(entrada: Entrada | null, ultimoPost: UltimoPost | null, agora = new Date()): Ticker {
  const quandoEntrou = entrada ? new Date(entrada.quando).getTime() : Number.NaN;
  if (entrada && Number.isFinite(quandoEntrou) && agora.getTime() - quandoEntrou < DIA_MS) {
    const grupo = entrada.grupo?.trim() ? ` no ${entrada.grupo.trim()}` : " num grupo";
    return {
      tipo: "entrada",
      texto: `${abreviaNome(entrada.nome)} entrou${grupo} · ${timeAgo(entrada.quando, agora)}`,
    };
  }
  if (ultimoPost) {
    const d = new Date(ultimoPost.quando);
    if (Number.isFinite(d.getTime())) {
      return {
        tipo: "post",
        texto: `Último post ${DIAS[d.getDay()]} ${dois(d.getHours())}:${dois(d.getMinutes())} · ${ultimoPost.enviados}/${ultimoPost.total} grupos`,
      };
    }
  }
  return { tipo: "vazio", texto: "Nenhuma entrada ainda · compartilhe o convite do grupo" };
}

export type AssinaturaResumo = {
  status: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end: string | null;
  plans: { name: string | null } | null;
} | null;

/** Rodapé do corredor: "GROWTH · renova 04/10". Só afirma o que veio do banco. */
export function romaneioDoPlano(sub: AssinaturaResumo): string {
  const nome = sub?.plans?.name?.trim();
  if (!nome) return "SEM PLANO · escolher";
  const plano = nome.toUpperCase();
  const fim = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  if (!fim || !Number.isFinite(fim.getTime())) return plano;
  const data = `${dois(fim.getDate())}/${dois(fim.getMonth() + 1)}`;
  if (sub?.status === "trialing") return `${plano} · teste até ${data}`;
  if (sub?.cancel_at_period_end) return `${plano} · até ${data}`;
  return `${plano} · renova ${data}`;
}
