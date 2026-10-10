export type TenantRole = "owner" | "admin" | "operator" | "seller";

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
  | "account:delete"
  | "message:send";

/**
 * O que cada papel faz DENTRO de uma rota. Quais rotas a vendedora (`seller`)
 * alcança é decidido antes, pelo mapa de `lib/auth/modulos.ts` (spec
 * acesso-vendedora §1, "Duas camadas"). Por isso `seller` aparece só em
 * `message:send`.
 */
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
  // POST /api/campanhas/[slug]/messages: postar na campanha sem poder editá-la.
  "message:send": ["owner", "admin", "operator", "seller"],
};

export function hasPermission(role: TenantRole, action: Action): boolean {
  return PERMISSIONS[action]?.includes(role) ?? false;
}

export function assertPermission(role: TenantRole, action: Action): void {
  if (!hasPermission(role, action)) {
    throw new Response("Sem permissão para esta ação.", { status: 403 });
  }
}

/** Papéis que entram por convite (POST /api/members). Dono nasce no cadastro, nunca por convite. */
const INVITABLE_ROLES: readonly TenantRole[] = ["admin", "operator"];

/**
 * Papel pedido no convite, ou `null` — a rota responde 400 "Função inválida.".
 *
 * Antes, papel desconhecido virava `operator` em silêncio: uma tela mandando
 * "seller" antes do backend aceitá-lo criaria um operador, com MAIS acesso que a
 * vendedora. O PR 6 da série acrescenta "seller" à lista.
 */
export function parseInviteRole(raw: unknown): TenantRole | null {
  if (typeof raw !== "string") return null;
  const role = raw.trim().toLowerCase();
  return INVITABLE_ROLES.find((r) => r === role) ?? null;
}
