/**
 * O telefone que a vendedora digita → as formas em que o mesmo número pode
 * estar gravado em `leads.phone`.
 *
 * O banco grava só dígitos (`upsert_lead`) e não normaliza o 55 nem o 9º
 * dígito: o worker grava o que o WhatsApp entrega e o "Registrar pedido" grava
 * o que foi digitado. O mesmo cliente pode estar como 5511987654321,
 * 11987654321 ou 1187654321 — a busca pergunta por todas.
 *
 * Puro, sem `server-only`: a tela de vendas usa as mesmas regras.
 */

/** DDD (11 a 99, nenhum termina em zero) + 8 ou 9 dígitos. */
const NATIONAL_NUMBER = /^[1-9][1-9]\d{8,9}$/;

/** DDD + número, sem o 55. null se não for número brasileiro com DDD. */
function nationalNumber(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  // 12–13 dígitos começando em 55 = país + DDD + número. Com 10–11, o 55 é o DDD (RS).
  const withoutCountry =
    digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
  return NATIONAL_NUMBER.test(withoutCountry) ? withoutCountry : null;
}

/** O mesmo celular com e sem o 9 da frente (o 9º dígito entrou entre 2012 e 2016). */
function withAndWithoutNine(national: string): string[] {
  const ddd = national.slice(0, 2);
  const number = national.slice(2);
  if (number.length === 9 && number.startsWith("9")) return [national, ddd + number.slice(1)];
  if (number.length === 8 && /^[6-9]/.test(number)) return [national, `${ddd}9${number}`];
  return [national];
}

/** Dígitos → variantes com/sem 55 e com/sem 9º dígito. null se < 10 dígitos nacionais. */
export function variantesDoTelefone(entrada: string): string[] | null {
  const national = nationalNumber(entrada);
  if (!national) return null;
  return [...new Set(withAndWithoutNine(national).flatMap((variant) => [variant, `55${variant}`]))];
}

/** "55" + DDD + número como digitado (com o 9 se veio com 9). null se inválido. */
export function telefoneCanonico(entrada: string): string | null {
  const national = nationalNumber(entrada);
  return national ? `55${national}` : null;
}
