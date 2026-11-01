/** Links do pedido e da busca do Rastreio. Puro. */
import { getPublicSiteUrl } from "@/lib/brand";

type Loja = { dominio: string | null; publicSlug: string };

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i; // sem @ / ? # : nem espaço

/** Domínio próprio ativo: caminho curto; senão o www da Girumo com o slug da loja. */
function base(loja: Loja): string {
  if (loja.dominio && HOSTNAME.test(loja.dominio)) return `https://${loja.dominio}/rastreio`;
  return `${getPublicSiteUrl().replace(/\/$/, "")}/rastreio/${encodeURIComponent(loja.publicSlug)}`;
}

export const linkDaBusca = (loja: Loja): string => base(loja);

export const linkDoPedido = (loja: Loja, token: string): string => `${base(loja)}/${encodeURIComponent(token)}`;
