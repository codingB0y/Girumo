/**
 * Campos da loja que o funil de disparos lê: `{loja}` = organizations.name,
 * `{nicho}` = organizations.niche. Validados aqui, na fronteira, antes de
 * qualquer escrita — o cliente não é confiável.
 */
export const STORE_NAME_MAX = 80;
export const NICHE_MAX = 60;

export type ProfileInput = { storeName?: string; niche?: string | null };

export function parseProfileInput(
  body: Record<string, unknown>,
): { ok: true; input: ProfileInput } | { ok: false; error: string } {
  const input: ProfileInput = {};

  if ("storeName" in body) {
    if (typeof body.storeName !== "string") return { ok: false, error: "Nome da loja inválido." };
    const nome = body.storeName.trim();
    if (!nome) return { ok: false, error: "O nome da loja não pode ficar vazio." };
    if (nome.length > STORE_NAME_MAX) {
      return { ok: false, error: `O nome da loja passa de ${STORE_NAME_MAX} caracteres.` };
    }
    input.storeName = nome;
  }

  if ("niche" in body) {
    if (body.niche !== null && typeof body.niche !== "string") return { ok: false, error: "Nicho inválido." };
    const nicho = (body.niche ?? "").trim();
    if (nicho.length > NICHE_MAX) return { ok: false, error: `O nicho passa de ${NICHE_MAX} caracteres.` };
    input.niche = nicho || null;
  }

  return { ok: true, input };
}
