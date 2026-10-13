/**
 * Valores do add-on Instagram para telas (cliente e servidor). Sem `node:crypto`:
 * o token e o cupom ficam em `instagram-addon.ts`, que só roda no servidor.
 */
export const IMPLANTACAO_CENTS = 49_700;
export const MENSAL_CENTS = 29_700;

/** Implementação depois do desconto do convite, em centavos (mesmo arredondamento do Stripe). */
export function implantacaoComDesconto(descontoPercent: number): number {
  return Math.round(IMPLANTACAO_CENTS * (1 - descontoPercent / 100));
}

export function formatarReais(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Inteiro de 0 a 100; qualquer outra coisa é `null`. */
export function parseDesconto(raw: unknown): number | null {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}
