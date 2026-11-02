import { diaMesBR } from "@/lib/date-br";
import { ETAPAS_COM_AVISO, type AvisoStatus, type Canal, type Etapa } from "@/lib/rastreio/tipos";

export const FILTROS = ["todos", "a_caminho", "sem_codigo", "problema", "entregues", "whatsapp_falhou"] as const;
export type FiltroDeEntregas = (typeof FILTROS)[number];

export function parseFiltroDeEntregas(v: string | null): FiltroDeEntregas {
  return (FILTROS as readonly string[]).includes(v ?? "") ? (v as FiltroDeEntregas) : "todos";
}

export const POR_PAGINA = 25;
export const JANELA_DIAS = 30;
export const DIAS_SEM_CODIGO = 2;
export const STATUS_FATURADO = ["invoiced", "ready_for_shipping", "on_carriage"] as const;
export const ETAPAS_DE_ENTREGA = ["enviado", "retirada", "problema", "entregue"] as const;

export type PedidoDaLista = {
  id: string; numero: string; buyerFirstName: string | null; buyerPhone: string | null; etapa: Etapa; etapaAt: string;
  trackingCode: string | null; statusRaw: string; linkToken: string;
};
export type AvisoDoPedido = { orderId: string; etapa: Etapa; canal: Canal; status: AvisoStatus };
export type ParteDoAviso = { texto: string; falhou: boolean };
export type LinhaDeEntrega = {
  id: string; numero: string; primeiroNome: string | null; etapa: Etapa; etapaAt: string; semCodigoHaDias: number | null;
  trackingCode: string | null; avisos: ParteDoAviso[]; link: string | null; telefone: string | null; podeReenviar: boolean;
};
export type NumerosDasEntregas = {
  todos: number; aCaminho: number; semCodigo: number; problema: number; whatsappFalhou: number; entreguesEm7Dias: number;
  avisosHoje: { whatsapp: number; email: number };
};
export type SaudeDoCodigo = { enviados: number; comCodigo: number; maisAntigoSemCodigo: { id: string; numero: string; desde: string } | null };
export type RespostaDeEntregas = {
  numeros: NumerosDasEntregas; filtro: FiltroDeEntregas; pagina: number; porPagina: number; total: number;
  linhas: LinhaDeEntrega[]; atualizadoEm: string;
};

const SITUACAO: Record<Etapa, string> = {
  aguardando_pagamento: "Aguardando pagamento", confirmado: "Pagamento confirmado", separando: "Em separação",
  enviado: "A caminho", retirada: "Pronto para retirada", problema: "Problema na entrega", entregue: "Entregue", cancelado: "Cancelado",
};
const NOVIDADE: Record<Etapa, string> = { ...SITUACAO, enviado: "Postado", retirada: "Na agência", problema: "Falha na entrega" };
const TOM: Partial<Record<Etapa, "risco" | "ok">> = { problema: "risco", entregue: "ok" };

const DIA_MS = 86_400_000;

export function diasSemCodigo(p: Pick<PedidoDaLista, "etapa" | "trackingCode" | "statusRaw" | "etapaAt">, agora: Date): number | null {
  if (p.etapa !== "separando" || p.trackingCode !== null || !(STATUS_FATURADO as readonly string[]).includes(p.statusRaw)) return null;
  const dias = Math.floor((agora.getTime() - new Date(p.etapaAt).getTime()) / DIA_MS);
  return dias >= DIAS_SEM_CODIGO ? dias : null;
}

export function rotuloDaSituacao(l: Pick<LinhaDeEntrega, "etapa" | "semCodigoHaDias">): { texto: string; tom: "neutro" | "atencao" | "risco" | "ok" } {
  if (l.etapa === "separando" && l.semCodigoHaDias !== null) return { texto: `Sem código há ${l.semCodigoHaDias} dias`, tom: "atencao" };
  return { texto: SITUACAO[l.etapa], tom: TOM[l.etapa] ?? "neutro" };
}

export function novidadeDaLinha(l: Pick<LinhaDeEntrega, "etapa" | "etapaAt">): string {
  return `${NOVIDADE[l.etapa]} · ${diaMesBR(l.etapaAt)}`;
}

export function resumoDosAvisos(avisos: readonly Pick<AvisoDoPedido, "canal" | "status">[]): ParteDoAviso[] {
  const parte = (canal: Canal): ParteDoAviso | null => {
    const a = avisos.find((x) => x.canal === canal && x.status !== "pulado");
    if (!a) return null;
    const nome = canal === "whatsapp" ? "WhatsApp" : "e-mail";
    if (a.status === "falhou") return { texto: `${nome} falhou`, falhou: true };
    if (a.status === "pendente" || a.status === "enviando") return { texto: `${nome} na fila`, falhou: false };
    const feito = canal === "whatsapp" ? a.status : "enviado"; // e-mail: enviado/entregue/lido contam como "enviado"
    return { texto: `${nome} ${feito}`, falhou: false };
  };
  const partes = [parte("whatsapp"), parte("email")].filter((x): x is ParteDoAviso => x !== null);
  return partes.length ? partes : [{ texto: "nenhum ainda", falhou: false }];
}

export function linhaDeEntrega(p: PedidoDaLista, avisos: readonly AvisoDoPedido[], link: string | null, agora: Date): LinhaDeEntrega {
  return {
    id: p.id, numero: p.numero, primeiroNome: p.buyerFirstName, etapa: p.etapa, etapaAt: p.etapaAt,
    semCodigoHaDias: diasSemCodigo(p, agora), trackingCode: p.trackingCode,
    avisos: resumoDosAvisos(avisos.filter((a) => a.orderId === p.id && a.etapa === p.etapa)),
    link, telefone: p.etapa === "problema" ? p.buyerPhone : null,
    podeReenviar: (ETAPAS_COM_AVISO as readonly string[]).includes(p.etapa),
  };
}

/** 80% é o piso: abaixo disso o medidor pede atenção. */
export function corDoMedidor(com: number, de: number): "ok" | "atencao" {
  return de === 0 || com / de >= 0.8 ? "ok" : "atencao";
}
