import "server-only";

import type { Etapa, EventoDaLinha, OrigemDoPedido, PedidoGravado, PedidoInterno, PedidoParaGravar, PedidoPublico } from "@/lib/rastreio/tipos";
import { abrir, chaveDeIntegracoes, selar } from "@/lib/security/secret-box";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Pedidos do Rastreio (`tracking_orders`). RLS sem policy e service-role: o filtro `tenant_id` é a
 * proteção real, e toda query leva o seu. O e-mail da compradora só existe selado (AAD = o pedido), o
 * telefone e o nome só saem por `lerPedido` (uso interno: os avisos), e a página pública lê só as
 * colunas públicas. Nada da compradora vai para log.
 */

const PEDIDOS = "tracking_orders";
const AVISOS = "tracking_notices";
const COLUNAS_PUBLICAS =
  "id,numero,order_created_at,etapa,etapa_at,events,shipment_service,tracking_code,tracking_url,link_token,notices_stopped_at";
const COLUNAS_INTERNAS = `${COLUNAS_PUBLICAS},tenant_id,external_id,status_raw,buyer_first_name,buyer_phone,buyer_email_enc`;
const MAX_BUSCA = 20;

type LinhaPublica = {
  id: string;
  numero: string;
  order_created_at: string;
  etapa: Etapa;
  etapa_at: string;
  events: EventoDaLinha[];
  shipment_service: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  link_token: string;
  notices_stopped_at: string | null;
};

type LinhaInterna = LinhaPublica & {
  tenant_id: string;
  external_id: string;
  status_raw: string;
  buyer_first_name: string | null;
  buyer_phone: string | null;
  buyer_email_enc: string | null;
};

type RetornoDaRpc = {
  id: string;
  etapa: Etapa;
  etapa_anterior: Etapa | null;
  mudou: boolean;
  link_token: string;
  notices_stopped_at: string | null;
  tem_telefone: boolean;
  tem_email: boolean;
};

function paraPublico(l: LinhaPublica): PedidoPublico {
  return {
    id: l.id,
    numero: l.numero,
    orderCreatedAt: l.order_created_at,
    etapa: l.etapa,
    etapaAt: l.etapa_at,
    events: l.events,
    shipmentService: l.shipment_service,
    trackingCode: l.tracking_code,
    trackingUrl: l.tracking_url,
    linkToken: l.link_token,
    noticesStoppedAt: l.notices_stopped_at,
  };
}

function paraInterno(l: LinhaInterna): PedidoInterno {
  return {
    ...paraPublico(l),
    tenantId: l.tenant_id,
    externalId: l.external_id,
    statusRaw: l.status_raw,
    buyerFirstName: l.buyer_first_name,
    buyerPhone: l.buyer_phone,
    buyerEmailEnc: l.buyer_email_enc,
  };
}

/** O contexto (AAD) do e-mail: a cifra de um pedido não abre como a de outro. */
const contextoDoEmail = (tenantId: string, externalId: string) => `rastreio:${tenantId}:yampi:${externalId}:email`;

/**
 * Grava (cria ou atualiza) o pedido pela RPC, que decide a etapa sob trava de linha. O e-mail é selado
 * aqui; com e-mail e sem chave de cifra, lança antes de ir ao banco.
 */
export async function gravarPedido(tenantId: string, pedido: PedidoParaGravar, origem: OrigemDoPedido): Promise<PedidoGravado> {
  // A RPC grava o id com btrim; o contexto do selo tem de ser o mesmo id, senão o e-mail nunca mais abre.
  const externalId = pedido.externalId.trim();
  let emailSelado: string | null = null;
  if (pedido.buyerEmail) {
    const chave = chaveDeIntegracoes();
    if (!chave) throw new Error("rastreio: INTEGRATIONS_ENCRYPTION_KEY ausente ou inválida");
    emailSelado = selar(pedido.buyerEmail, contextoDoEmail(tenantId, externalId), chave);
  }

  const { data, error } = await getSupabaseAdmin().rpc("rastreio_gravar_pedido", {
    p_tenant: tenantId,
    p_pedido: {
      external_id: externalId,
      numero: pedido.numero,
      order_created_at: pedido.orderCreatedAt,
      status_raw: pedido.statusRaw,
      etapa: pedido.etapa,
      tracking_code: pedido.trackingCode,
      tracking_url: pedido.trackingUrl,
      shipment_service: pedido.shipmentService,
      buyer_first_name: pedido.buyerFirstName,
      buyer_phone: pedido.buyerPhone,
      buyer_email_enc: emailSelado,
      doc_hmac: pedido.docHmac,
      historico: pedido.historico,
      carimbar: origem !== "importacao",
    },
  });
  if (error) throw new Error(error.message);
  const r = data as RetornoDaRpc | null;
  if (!r) throw new Error("rastreio: a gravação do pedido não devolveu nada");
  return {
    id: r.id,
    etapa: r.etapa,
    etapaAnterior: r.etapa_anterior,
    mudou: r.mudou,
    linkToken: r.link_token,
    paradoEm: r.notices_stopped_at,
    temTelefone: r.tem_telefone,
    temEmail: r.tem_email,
  };
}

export async function lerPedido(tenantId: string, orderId: string): Promise<PedidoInterno | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(PEDIDOS)
    .select(COLUNAS_INTERNAS)
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? paraInterno(data as unknown as LinhaInterna) : null;
}

/** O e-mail em texto, ou null (sem e-mail, ou a cifra não abriu). O log nunca leva o e-mail. */
export function abrirEmailDoPedido(pedido: PedidoInterno): string | null {
  if (!pedido.buyerEmailEnc) return null;
  const chave = chaveDeIntegracoes();
  try {
    if (!chave) throw new Error("sem chave");
    return abrir(pedido.buyerEmailEnc, contextoDoEmail(pedido.tenantId, pedido.externalId), chave);
  } catch {
    console.error(`[rastreio] e-mail do pedido ${pedido.id} não abriu`);
    return null;
  }
}

/** Busca pública: documento + 4 últimos do celular, da loja, desde a data; mais novo primeiro. */
export async function buscarPedidos(tenantId: string, docHmac: string, phoneLast4: string, desde: Date): Promise<PedidoPublico[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(PEDIDOS)
    .select(COLUNAS_PUBLICAS)
    .eq("tenant_id", tenantId)
    .eq("doc_hmac", docHmac)
    .eq("phone_last4", phoneLast4)
    .gte("order_created_at", desde.toISOString())
    .order("order_created_at", { ascending: false })
    .limit(MAX_BUSCA);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as LinhaPublica[]).map(paraPublico);
}

export async function pedidoPorToken(tenantId: string, linkToken: string): Promise<PedidoPublico | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(PEDIDOS)
    .select(COLUNAS_PUBLICAS)
    .eq("tenant_id", tenantId)
    .eq("link_token", linkToken)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? paraPublico(data as unknown as LinhaPublica) : null;
}

/**
 * "Parar avisos" do link: grava `notices_stopped_at` uma vez e passa a `pulado` os avisos pendentes do
 * pedido. Idempotente (o segundo clique só repete o pulo). Não toca em `optouts`: isso é só deste pedido.
 */
export async function pararAvisos(tenantId: string, linkToken: string): Promise<{ orderId: string } | null> {
  const agora = new Date().toISOString();
  const db = getSupabaseAdmin();
  const parou = await db
    .from(PEDIDOS)
    .update({ notices_stopped_at: agora })
    .eq("tenant_id", tenantId)
    .eq("link_token", linkToken)
    .is("notices_stopped_at", null)
    .select("id");
  if (parou.error) throw new Error(parou.error.message);

  let orderId = (parou.data?.[0] as { id: string } | undefined)?.id;
  if (!orderId) {
    const { data, error } = await db.from(PEDIDOS).select("id").eq("tenant_id", tenantId).eq("link_token", linkToken).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    orderId = (data as { id: string }).id;
  }

  const pulou = await db
    .from(AVISOS)
    .update({ status: "pulado", updated_at: agora })
    .eq("tenant_id", tenantId)
    .eq("order_id", orderId)
    .eq("status", "pendente");
  if (pulou.error) throw new Error(pulou.error.message);
  return { orderId };
}

/** Apaga os pedidos 90 dias depois de entregue/cancelado (global por desenho); devolve quantos saíram. */
export async function purgarVencidos(): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc("rastreio_purgar");
  if (error) throw new Error(error.message);
  if (typeof data !== "number") throw new Error("rastreio: o purge não devolveu uma contagem");
  return data;
}
