import { diaMesBR } from "@/lib/date-br";

/**
 * Regras puras da casca da Vitrine Aberta (spec 2026-09-07, 3.1 e 3.5):
 * iniciais da loja, nome abreviado e o romaneio do plano.
 * Sem fetch aqui; os componentes buscam e passam os dados.
 */

/** Iniciais da loja no topo do corredor: "Mega Stock Atacado" → "MS". */
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

/** Rodapé do corredor: "GROWTH · renova 04/10". Só afirma o que veio do banco. */
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
