/**
 * Como o catálogo de planos vira oferta na tela.
 *
 * Separado do componente porque decidir O QUE oferecer é regra, não layout — e
 * a regra tem duas armadilhas que só aparecem em produção: oferecer o FREE a
 * quem já está nele (um convite a não fazer nada) e oferecer plano sem
 * `stripe_price_id`, que leva a um checkout respondendo 400. Botão que só pode
 * falhar é pior que botão ausente.
 */

export type PlanoCatalogo = {
  code: string;
  name: string;
  price_cents: number | null;
  stripe_price_id: string | null;
  sort_order?: number | null;
};

/**
 * Preço em reais, sem centavos quando eles são zero.
 *
 * "R$ 197,00" num card de assinatura só adiciona ruído: os preços do catálogo
 * são redondos. Quando não forem, os centavos aparecem.
 */
export function formatarPreco(cents: number): string {
  const reais = cents / 100;
  const temCentavos = cents % 100 !== 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: temCentavos ? 2 : 0,
    maximumFractionDigits: temCentavos ? 2 : 0,
  })
    .format(reais)
    .replace(/ /g, " ");
}

/**
 * Os planos que fazem sentido oferecer a quem bateu num limite.
 *
 * Nunca lança: esta lista alimenta um paywall que abre EM CIMA de um erro. Se
 * ela estourasse, o cliente perderia também a mensagem que explicava o
 * bloqueio.
 */
export function planosParaOferecer(catalogo: readonly PlanoCatalogo[]): PlanoCatalogo[] {
  if (!Array.isArray(catalogo)) return [];

  return catalogo
    .filter(
      (p) =>
        p &&
        typeof p.code === "string" &&
        typeof p.price_cents === "number" &&
        p.price_cents > 0 &&
        typeof p.stripe_price_id === "string" &&
        p.stripe_price_id.length > 0,
    )
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
}
