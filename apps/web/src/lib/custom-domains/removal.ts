import type { CustomDomain } from "@/lib/stores/custom-domains";

/**
 * Tirar o host do projeto Vercel ao remover a linha? Só se ESTA linha pode ter
 * posto ele lá (passou do TXT de posse) e nenhuma OUTRA conta tem o mesmo host
 * ativo. Sem isto, um tenant cadastrava o domínio de outra loja (fica pendente,
 * sem prova) e, ao remover, derrubava o domínio dela.
 */
export function shouldRemoveFromVercel(
  domain: Pick<CustomDomain, "status" | "lastError">,
  activeOwner: string | null,
  tenantId: string,
): boolean {
  const passouDoTxt = domain.status === "active" || (domain.lastError !== null && domain.lastError !== "txt");
  return passouDoTxt && (activeOwner === null || activeOwner === tenantId);
}
