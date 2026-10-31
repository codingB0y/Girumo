/** CPF/CNPJ do comprador: normaliza, valida e vira HMAC. O documento em texto nunca é gravado nem logado. */
import "server-only";
import { createHmac } from "node:crypto";
import { cnpjValido } from "@/lib/bio/documento";

export type DocumentoNormalizado = { tipo: "cpf" | "cnpj"; digitos: string };

const PEPPER_MIN = 32;

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string) => {
    const soma = [...base].reduce((s, c, i) => s + Number(c) * (base.length + 1 - i), 0);
    return ((soma * 10) % 11) % 10;
  };
  return dv(cpf.slice(0, 9)) === Number(cpf[9]) && dv(cpf.slice(0, 10)) === Number(cpf[10]);
}

/** Aceita o documento digitado de qualquer jeito (pontos, traço, barra, espaços); inválido → null. */
export function normalizarDocumento(entrada: string): DocumentoNormalizado | null {
  const limpo = entrada.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (/^\d{11}$/.test(limpo)) return cpfValido(limpo) ? { tipo: "cpf", digitos: limpo } : null;
  if (limpo.length === 14 && cnpjValido(limpo)) return { tipo: "cnpj", digitos: limpo };
  return null;
}

export function docHmac(digitos: string, pepper: string): string {
  return createHmac("sha256", pepper).update(digitos).digest("hex");
}

/** Falha alto sem o pepper: sem ele nada é lido nem gravado. O valor nunca entra no erro. */
export function pepperDoRastreio(): string {
  const pepper = (process.env.RASTREIO_DOC_PEPPER ?? "").trim();
  if (pepper.length < PEPPER_MIN) throw new Error("RASTREIO_DOC_PEPPER ausente ou com menos de 32 caracteres");
  return pepper;
}

/** Os 4 últimos dígitos do telefone canônico. */
export function ultimos4(telefone: string): string {
  return telefone.slice(-4);
}
