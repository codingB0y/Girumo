/**
 * Validação de entrada das rotas de comunidade — puro, sem "server-only", pra
 * rodar sob `tsx --test` sem o shim. A rota decide o status HTTP; aqui só
 * decide aceita/rejeita.
 */

const NOME_MAX_LENGTH = 60;

export type ValidationResult<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Nome da comunidade: não-vazio (depois de `trim`) e até 60 caracteres. */
export function validarNomeComunidade(nome: unknown): ValidationResult<{ nome: string }> {
  if (typeof nome !== "string") {
    return { ok: false, error: "nome é obrigatório." };
  }
  const trimmed = nome.trim();
  if (!trimmed) {
    return { ok: false, error: "nome não pode ser vazio." };
  }
  if (trimmed.length > NOME_MAX_LENGTH) {
    return { ok: false, error: `nome deve ter no máximo ${NOME_MAX_LENGTH} caracteres.` };
  }
  return { ok: true, nome: trimmed };
}

/** `whatsappGroupId` do corpo de POST/DELETE grupos: presente e string não-vazia. */
export function validarWhatsappGroupId(body: unknown): ValidationResult<{ whatsappGroupId: string }> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "whatsappGroupId é obrigatório." };
  }
  const whatsappGroupId = (body as Record<string, unknown>).whatsappGroupId;
  if (typeof whatsappGroupId !== "string" || !whatsappGroupId.trim()) {
    return { ok: false, error: "whatsappGroupId é obrigatório." };
  }
  return { ok: true, whatsappGroupId };
}
