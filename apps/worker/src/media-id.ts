/**
 * Resolução de `mediaId` → caminho no Storage, com checagem de tenant.
 *
 * O `mediaId` que o app gera é o storage path em base64url
 * (`<tenantId>/media/<uuid>.<ext>`), NÃO um segredo — ver o comentário em
 * `apps/web/src/lib/media-store.ts` ("o id é só o storage path codificado").
 *
 * Por isso a checagem de tenant aqui é OBRIGATÓRIA e não paranoia: sem ela, um
 * comando forjado com o mediaId de outro tenant faria o worker assinar e enviar
 * mídia alheia. Espelha `mediaPathBelongsToTenant` (`apps/web/src/lib/media-path.ts`).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Mesmo formato aceito pelo app: `<uuid>/media/<arquivo>.<ext>`. */
const STORAGE_PATH = /^[0-9a-f-]{36}\/media\/[0-9a-f-]+\.[a-z0-9]{2,5}$/i;

export function mediaPathBelongsToTenant(storagePath: string, tenantId: string): boolean {
  if (!UUID.test(tenantId) || !storagePath.startsWith(`${tenantId}/media/`)) return false;
  const filename = storagePath.slice(`${tenantId}/media/`.length);
  return filename.length > 0 && !filename.includes("/") && !filename.includes("\\") && !filename.includes("..");
}

/**
 * Decodifica o mediaId e valida que pertence ao tenant do comando.
 * Devolve `null` em qualquer suspeita — o caller trata como payload inválido.
 */
export function resolveMediaPath(mediaId: string, tenantId: string): string | null {
  let decoded: string;
  try {
    decoded = Buffer.from(mediaId, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!STORAGE_PATH.test(decoded)) return null;
  if (!mediaPathBelongsToTenant(decoded, tenantId)) return null;
  return decoded;
}
