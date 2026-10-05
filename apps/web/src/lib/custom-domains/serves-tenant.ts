import "server-only";
import { getActiveDomainTenant } from "@/lib/stores/custom-domains";
import { isFirstPartyHost } from "./host";

/**
 * Este host pode mostrar conteúdo deste tenant?
 *
 * Host do Girumo: sempre (o comportamento de antes). Domínio de lojista: só o
 * do próprio lojista, e só ativo — sem isto `links.lojaA.com.br/r/<slug-de-B>`
 * abriria o grupo de B no endereço de A. Erro de banco nega: link que não abre
 * é recuperável; grupo de outra loja no endereço errado não é.
 */
export async function hostServesTenant(
  hostname: string,
  tenantId: string,
  lookup: (hostname: string) => Promise<string | null> = getActiveDomainTenant,
): Promise<boolean> {
  if (isFirstPartyHost(hostname)) return true;
  try {
    return (await lookup(hostname.trim().toLowerCase())) === tenantId;
  } catch (err) {
    console.error(`[custom-domains] dono de ${hostname}:`, err);
    return false;
  }
}
