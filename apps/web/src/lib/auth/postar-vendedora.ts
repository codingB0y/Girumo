import type { TenantRole } from "@/lib/permissions";

/**
 * Limites da vendedora ao postar numa campanha. Ela tem `message:send`, mas não
 * `campaign:edit`: não pode mirar grupo fora da campanha nem criar agendamento
 * recorrente (que ela não conseguiria cancelar). Devolve a mensagem de 403, ou
 * null se pode seguir. Outros papéis: sempre null.
 */
export function regraDaVendedora(input: {
  role: TenantRole;
  groupIds: unknown;
  campGroupIds: readonly string[];
  recurrence: string;
}): string | null {
  if (input.role !== "seller") return null;
  if (
    Array.isArray(input.groupIds) &&
    input.groupIds.some((id) => !input.campGroupIds.includes(String(id)))
  ) {
    return "Grupo fora da campanha.";
  }
  if (input.recurrence !== "none") return "Agendamento recorrente só pelo dono ou pela equipe.";
  return null;
}
