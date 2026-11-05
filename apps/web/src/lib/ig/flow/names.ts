import { normalizeForMatch } from "@/lib/ig/match-keyword";

/**
 * Dono único do formato de etiqueta e de campo da ficha. O SQL do `ig_contacts`
 * usa as mesmas expressões regulares: mudou aqui, muda lá.
 */
export const TAG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;

/** "Quer Infantil" → "quer-infantil". `null` quando não sobra nada válido. */
export function normalizeTag(texto: string): string | null {
  const tag = normalizeForMatch(texto)
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return TAG_RE.test(tag) ? tag : null;
}

export function isValidFieldKey(chave: string): boolean {
  return FIELD_KEY_RE.test(chave);
}

/** "Tamanho do pé" → "tamanho_do_pe". `null` quando não sobra nada válido. */
export function toFieldKey(texto: string): string | null {
  const chave = normalizeForMatch(texto)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^[^a-z]+/, "")
    .slice(0, 32)
    .replace(/_+$/, "");
  return isValidFieldKey(chave) ? chave : null;
}

/** "tamanho_do_pe" → "Tamanho do pe": o rótulo mostrado na ficha. */
export function fieldLabel(chave: string): string {
  const texto = chave.replace(/_/g, " ").trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
