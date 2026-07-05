const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseEngineTenantId(value: string | null): string {
  if (!value || !UUID.test(value)) {
    throw new Error("Tenant da engine ausente ou inválido.");
  }
  return value;
}

export function getEngineTenantId(req: Request): string {
  return parseEngineTenantId(req.headers.get("x-tenant-id"));
}
