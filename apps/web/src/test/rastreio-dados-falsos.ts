/**
 * Dados de teste do Rastreio. O repositório é público: nada de documento,
 * telefone, e-mail ou nome de gente de verdade. CPF e CNPJ são gerados aqui,
 * com os dígitos verificadores calculados.
 */

function cpfDv(base: string): string {
  const soma = [...base].reduce((s, c, i) => s + Number(c) * (base.length + 1 - i), 0);
  return String(((soma * 10) % 11) % 10);
}

/** CPF válido a partir dos 9 dígitos de base. */
export function gerarCpf(base9: string): string {
  const com1 = base9 + cpfDv(base9);
  return com1 + cpfDv(com1);
}

function cnpjDv(base: string): string {
  const soma = [...base].reduce((s, c, i) => s + (c.charCodeAt(0) - 48) * (((base.length - 1 - i) % 8) + 2), 0);
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

/** CNPJ válido (numérico ou alfanumérico) a partir dos 12 caracteres de base. */
export function gerarCnpj(base12: string): string {
  const com1 = base12 + cnpjDv(base12);
  return com1 + cnpjDv(com1);
}
