export type TenantRole = "owner" | "admin" | "operator";

export type Action =
  | "billing:manage"
  | "billing:view"
  | "team:invite"
  | "team:remove"
  | "campaign:delete"
  | "campaign:create"
  | "campaign:edit"
  | "settings:connection"
  | "settings:account"
  | "account:delete";

const PERMISSIONS: Record<Action, TenantRole[]> = {
  "billing:manage": ["owner"],
  "billing:view": ["owner", "admin"],
  "team:invite": ["owner", "admin"],
  "team:remove": ["owner"],
  "campaign:delete": ["owner", "admin"],
  "campaign:create": ["owner", "admin", "operator"],
  "campaign:edit": ["owner", "admin", "operator"],
  "settings:connection": ["owner", "admin"],
  "settings:account": ["owner", "admin", "operator"],
  "account:delete": ["owner"],
};

export function hasPermission(role: TenantRole, action: Action): boolean {
  return PERMISSIONS[action]?.includes(role) ?? false;
}

export function assertPermission(role: TenantRole, action: Action): void {
  if (!hasPermission(role, action)) {
    throw new Response("Sem permissão para esta ação.", { status: 403 });
  }
}
