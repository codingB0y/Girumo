/**
 * O valor que a lojista digita no pedido.
 *
 * Mora fora da rota porque a tela também precisa dele: a Vitrine soma o pedido
 * no caixa do mês antes do refetch, e se ela interpretar o que foi digitado de
 * um jeito e o servidor de outro, o total na tela fica diferente do que foi
 * gravado — e continua diferente até um reload. Aconteceu com "149.90": o
 * cliente tirava todo ponto e lia 14990, o servidor lia 149,90.
 */

/** Aceita vírgula decimal com ponto de milhar ("1.149,90") e ponto decimal ("149.90"). */
export function parseValorDoPedido(bruto: unknown): number {
  if (typeof bruto === "number") return bruto;
  const texto = String(bruto ?? "").trim();
  if (!texto) return Number.NaN;
  // Com vírgula, o ponto é separador de milhar. Sem vírgula, o ponto é decimal.
  const normalizado = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;
  return Number(normalizado);
}
