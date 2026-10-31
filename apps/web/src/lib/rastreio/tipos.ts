/** Tipos do Rastreio do pedido (contrato entre os PRs). Puro: sem server-only, o cliente também importa. */

export const ETAPAS = ["aguardando_pagamento", "confirmado", "separando", "enviado", "retirada", "problema", "entregue", "cancelado"] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETAPAS_COM_AVISO = ["confirmado", "enviado", "retirada", "problema", "entregue"] as const;
export type EtapaComAviso = (typeof ETAPAS_COM_AVISO)[number];

export type Canal = "whatsapp" | "email";
export type MatrizAvisos = Record<EtapaComAviso, Record<Canal, boolean>>;

/** Spec §1.1; é também o default de `tracking_settings.matrix` no banco. */
export const MATRIZ_PADRAO: MatrizAvisos = {
  confirmado: { whatsapp: false, email: false },
  enviado: { whatsapp: true, email: true },
  retirada: { whatsapp: true, email: true },
  problema: { whatsapp: true, email: true },
  entregue: { whatsapp: true, email: false },
};

export type AvisoStatus = "pendente" | "enviando" | "enviado" | "entregue" | "lido" | "falhou" | "pulado";
export type OrigemDoPedido = "aviso" | "varredura" | "importacao";
export type EventoDaLinha = { etapa: Etapa; at: string }; // ISO

export type PedidoParaGravar = {
  externalId: string;
  numero: string;
  orderCreatedAt: string;
  statusRaw: string;
  etapa: Etapa | null; // null = alias desconhecido: mantém a etapa gravada
  trackingCode: string | null;
  trackingUrl: string | null;
  shipmentService: string | null;
  buyerFirstName: string | null;
  buyerPhone: string | null; // canônico 55+DDD+número (telefoneCanonico)
  buyerEmail: string | null; // em texto: a store sela antes da RPC
  docHmac: string | null;
  historico: EventoDaLinha[]; // de include=statuses com data; [] quando não houver
  atualizadoNaYampi: string; // updated_at do pedido na Yampi (ISO)
};

export type PedidoGravado = {
  id: string;
  etapa: Etapa;
  etapaAnterior: Etapa | null;
  mudou: boolean;
  linkToken: string;
  paradoEm: string | null;
  temTelefone: boolean; // do que ficou gravado (nulo não apaga contato)
  temEmail: boolean;
};

export type PedidoPublico = {
  id: string;
  numero: string;
  orderCreatedAt: string;
  etapa: Etapa;
  etapaAt: string;
  events: EventoDaLinha[];
  shipmentService: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  linkToken: string;
  noticesStoppedAt: string | null;
};

export type PedidoInterno = PedidoPublico & {
  tenantId: string;
  externalId: string;
  statusRaw: string;
  buyerFirstName: string | null;
  buyerPhone: string | null;
  buyerEmailEnc: string | null;
};

export type RastreioConfig = {
  tenantId: string;
  publicSlug: string;
  matrix: MatrizAvisos;
  notifyStoreOnProblem: boolean;
  vipLinkId: string | null;
  storeWhatsapp: string | null;
  importedAt: string | null;
  sweepCursor: string | null;
};

export type AvisoParaEnviar = {
  id: string;
  orderId: string;
  etapa: EtapaComAviso;
  canal: Canal;
  attempts: number;
  resends: number;
  messageId: string | null;
};
