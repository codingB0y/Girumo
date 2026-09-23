import { mediaPathBelongsToTenant } from "@/lib/media-path";

/** Foto ou vídeo anexado a uma copy da Biblioteca. */
export type TemplateMedia = { media_id: string; media_type: "image" | "video"; media_name: string | null };

/** Colunas gravadas em `templates` — tudo null quando a copy perde o anexo. */
export type TemplateMediaColumns = TemplateMedia | { media_id: null; media_type: null; media_name: null };

const SEM_MIDIA = { media_id: null, media_type: null, media_name: null } as const;
const MAX_NOME = 200;

/**
 * Lê o campo `media` do corpo das rotas da Biblioteca.
 *
 * - `undefined` → campo ausente, não mexe no anexo (PATCH só de texto).
 * - `null`      → remove o anexo.
 * - objeto      → valida e devolve as colunas; o id é o storage path em
 *                 base64url de `/api/media`, então conferir o prefixo do tenant
 *                 é o que impede anexar mídia de outra loja.
 *
 * Lança `Error` com mensagem pro usuário quando o objeto é inválido.
 */
export function parseTemplateMedia(raw: unknown, tenantId: string): TemplateMediaColumns | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return SEM_MIDIA;
  if (typeof raw !== "object") throw new Error("Anexo inválido.");

  const { media_id, media_type, media_name } = raw as Record<string, unknown>;
  if (media_type !== "image" && media_type !== "video") throw new Error("Anexo precisa ser foto ou vídeo.");
  if (typeof media_id !== "string" || !mediaIdBelongsToTenant(media_id, tenantId)) {
    throw new Error("Anexo não encontrado.");
  }
  const name = typeof media_name === "string" && media_name.trim() ? media_name.trim().slice(0, MAX_NOME) : null;
  return { media_id, media_type, media_name: name };
}

function mediaIdBelongsToTenant(id: string, tenantId: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return false;
  const path = Buffer.from(id, "base64url").toString("utf8");
  return mediaPathBelongsToTenant(path, tenantId);
}
