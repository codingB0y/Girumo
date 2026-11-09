/** "Ver mensagem" de Configurações › Rastreio: o texto de cada aviso com dados de exemplo. Puro (roda no navegador). */
import { montarEmailDoAviso } from "./email";
import { linkDaBusca as linkDaBuscaDe } from "./link";
import type { EtapaComAviso, PedidoInterno } from "./tipos";

export type DadosDaPrevia = { loja: string; linkDaBusca: string | null; storeWhatsapp: string | null };

const SLUG_DE_EXEMPLO = "loja-exemplo";
const TOKEN_DE_EXEMPLO = "exemplo";

const PEDIDO_DE_EXEMPLO: PedidoInterno = {
  id: "exemplo",
  tenantId: "exemplo",
  externalId: "exemplo",
  numero: "1541",
  orderCreatedAt: "2026-10-29T15:00:00.000Z",
  etapa: "enviado",
  etapaAt: "2026-10-29T15:00:00.000Z",
  events: [],
  statusRaw: "on_carriage",
  shipmentService: "PAC",
  trackingCode: "AB123456789BR",
  trackingUrl: null,
  linkToken: TOKEN_DE_EXEMPLO,
  noticesStoppedAt: null,
  buyerFirstName: "Ana",
  buyerPhone: null,
  buyerEmailEnc: null,
};

/** Ainda não há fonte: `mensagens.ts` (PR 5) não está em main. Quando entrar, troca este `null` pela chamada. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- a assinatura é a da fonte que vai entrar
export function previaDoWhatsapp(_etapa: EtapaComAviso, _d: DadosDaPrevia): string | null {
  return null;
}

/** O assunto e o texto do e-mail real (`montarEmailDoAviso`, PR 4) com a compradora de exemplo. */
export function previaDoEmail(etapa: EtapaComAviso, d: DadosDaPrevia): { assunto: string; texto: string } | null {
  const loja = {
    tenantId: "exemplo",
    nome: d.loja,
    publicSlug: SLUG_DE_EXEMPLO,
    dominio: null,
    corPrimaria: null,
    storeWhatsapp: d.storeWhatsapp,
    vipLinkId: null,
  };
  const { subject, text } = montarEmailDoAviso(loja, PEDIDO_DE_EXEMPLO, etapa, null);
  // A tela não conhece o slug nem o domínio da loja, só o link da busca: troca a base de exemplo por ele.
  const texto = d.linkDaBusca ? text.split(linkDaBuscaDe(loja)).join(d.linkDaBusca) : text;
  return { assunto: subject, texto };
}
