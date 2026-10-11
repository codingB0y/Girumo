// apps/web/src/lib/integracoes/redirect-do-cadastro.ts
import { campaignLinkPath } from "@/lib/custom-domains/host";
import { getAppUrl } from "@/lib/environment";

/**
 * Para onde o site manda a pessoa depois do cadastro: o link de grupo da loja
 * com o id do cadastro (`cid`), que o /r/ grava junto do clique.
 *
 * Domínio próprio só entra ATIVO (quem chama já filtrou): pendente ainda não
 * serve link, e mandar a pessoa para lá seria mandá-la para um 404.
 */
export function redirectDoCadastro(entrada: { dominioAtivo: string | null; slug: string; captureId: string }): string {
  const origem = entrada.dominioAtivo ? `https://${entrada.dominioAtivo}` : getAppUrl().replace(/\/+$/, "");
  const url = new URL(campaignLinkPath(origem, entrada.slug), origem);
  url.searchParams.set("cid", entrada.captureId);
  return url.toString();
}
