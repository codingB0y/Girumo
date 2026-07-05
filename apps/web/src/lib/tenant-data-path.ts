import path from "node:path";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function tenantDataPath(baseDir: string, tenantId: string, filename: string): string {
  if (!UUID.test(tenantId)) throw new Error("tenantId inválido");
  if (!/^[a-z0-9.-]+$/i.test(filename) || filename.includes("..")) {
    throw new Error("filename inválido");
  }
  return path.join(baseDir, "tenants", tenantId, filename);
}
