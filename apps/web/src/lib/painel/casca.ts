import { diaMesBR } from "@/lib/date-br";
import type { Liberacoes } from "@/lib/painel-nav";

/**
 * Regras puras da casca da Vitrine Aberta (spec 2026-09-07, 3.1 e 3.5):
 * iniciais da loja, nome abreviado e o romaneio do plano.
 * Sem fetch aqui; os componentes buscam e passam os dados.
 */

/** Iniciais da loja no avatar da barra de cima: "Mega Stock Atacado" → "MS". */
export function iniciaisDaLoja(nome?: string | null): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "•";
  return partes
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/** "Josiane Maria Silva" → "Josiane M." (regra 6: nome completo só em Contatos). */
export function abreviaNome(nome?: string | null): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "Alguém";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[1][0].toUpperCase()}.`;
}

export type AssinaturaResumo = {
  status: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end: string | null;
  plans: { name: string | null } | null;
} | null;

/** Rodapé do menu Mais: "GROWTH · renova 04/10". Só afirma o que veio do banco. */
export function romaneioDoPlano(sub: AssinaturaResumo): string {
  const nome = sub?.plans?.name?.trim();
  // `canceled` mantém o `plan_id` apontado, mas não concede nada (subscriptionAccess):
  // é o fim do teste com cartão repetido e de toda assinatura encerrada. Dizer
  // "renova" ali contradizia a faixa ("Não cobramos nada") e Configurações ("Inativa").
  if (!nome || sub?.status === "canceled") return "SEM PLANO · escolher";
  const plano = nome.toUpperCase();
  // Fuso de Brasília, como o resto do painel: `getDate()` lia o do navegador, e
  // perto da meia-noite o rodapé mostrava um dia diferente de Configurações e da faixa.
  const data = diaMesBR(sub?.current_period_end);
  if (!data) return plano;
  if (sub?.status === "trialing") return `${plano} · teste até ${data}`;
  if (sub?.cancel_at_period_end) return `${plano} · até ${data}`;
  return `${plano} · renova ${data}`;
}

/** O que a casca guarda de `GET /api/recuperar/status`. */
export type RecuperarNaCasca = { enabled: boolean; precisaDeVoce: number };

/**
 * Lê o corpo da rota. Sem `enabled` booleano não há resposta (null); a contagem é
 * inteira, nunca negativa, e zero com o add-on desligado.
 */
export function lerStatusDoRecuperar(raw: unknown): RecuperarNaCasca | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { enabled, precisaDeVoce } = raw as { enabled?: unknown; precisaDeVoce?: unknown };
  if (typeof enabled !== "boolean") return null;
  const n = Math.trunc(Number(precisaDeVoce));
  return { enabled, precisaDeVoce: enabled && Number.isFinite(n) && n > 0 ? n : 0 };
}

export type LeituraDaCasca = {
  perguntouInstagram: boolean;
  instagram: { enabled: boolean } | null;
  perguntouRecuperar: boolean;
  recuperar: RecuperarNaCasca | null;
  /** A última pergunta do Recuperar falhou. Não apaga `recuperar`: falha não é "desligado". */
  recuperarFalhou: boolean;
};

/**
 * As liberações do menu. `null` até chegar toda resposta que o acesso pediu (não
 * pisca item). Recuperar que falhou conta como respondido, para não prender o
 * Instagram; sem estado conhecido ele fica fechado.
 */
export function liberacoesDaCasca(i: LeituraDaCasca): Liberacoes | null {
  if (!i.perguntouInstagram && !i.perguntouRecuperar) return null;
  if (i.perguntouInstagram && !i.instagram) return null;
  if (i.perguntouRecuperar && !i.recuperar && !i.recuperarFalhou) return null;
  return { instagram: i.instagram?.enabled ?? false, recuperar: i.recuperar?.enabled ?? false };
}
