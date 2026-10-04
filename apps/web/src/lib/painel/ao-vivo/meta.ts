/**
 * Texto digitado na meta do mês → reais inteiros, ou null se não vale.
 * Aceita "50000", "50.000", "R$ 50.000" e "50000,50" (arredonda); zero, negativo e lixo recusam.
 */
export function metaDoTexto(texto: string): number | null {
  const limpo = texto.replace(/[R$\s.]/g, "").replace(",", ".");
  if (!limpo) return null;
  const valor = Math.round(Number(limpo));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}
