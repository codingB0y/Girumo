const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function mediaPathBelongsToTenant(storagePath: string, tenantId: string): boolean {
  if (!UUID.test(tenantId) || !storagePath.startsWith(`${tenantId}/media/`)) return false;
  const filename = storagePath.slice(`${tenantId}/media/`.length);
  return filename.length > 0 && !filename.includes("/") && !filename.includes("\\") && !filename.includes("..");
}
