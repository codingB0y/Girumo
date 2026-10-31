/** Links do pedido e da busca do Rastreio. Puro. */
import { getPublicSiteUrl } from "@/lib/brand";

type Loja = { dominio: string | null; publicSlug: string };

/** Domínio próprio ativo: caminho curto; senão o www da Girumo com o slug da loja. */
function base(loja: Loja): string {
  if (loja.dominio) return `https://${loja.dominio}/rastreio`;
  return `${getPublicSiteUrl().replace(/\/$/, "")}/rastreio/${encodeURIComponent(loja.publicSlug)}`;
}

export const linkDaBusca = (loja: Loja): string => base(loja);

export const linkDoPedido = (loja: Loja, token: string): string => `${base(loja)}/${encodeURIComponent(token)}`;
