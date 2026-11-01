import "server-only";

import { dayBR } from "@/lib/date-br";
import { docHmac, normalizarDocumento, pepperDoRastreio } from "@/lib/rastreio/documento";
import {
  DIAS_SEM_CODIGO,
  ETAPAS_DE_ENTREGA,
  JANELA_DIAS,
  POR_PAGINA,
  STATUS_FATURADO,
  type AvisoDoPedido,
  type FiltroDeEntregas,
  type NumerosDasEntregas,
  type PedidoDaLista,
  type SaudeDoCodigo,
} from "@/lib/rastreio/entregas";
import type { AvisoStatus, Canal, Etapa } from "@/lib/rastreio/tipos";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Leitura da tela Entregas. Service-role passa por cima do RLS: o `tenant_id` em toda query é a proteção. */

export type ConsultaDeEntregas = {
  filtro: FiltroDeEntregas;
  busca: string | null;
  pedidoId: string | null;
  pagina: number;
  agora: Date;
};

const ORDERS = "tracking_orders";
const NOTICES = "tracking_notices";
const COLUNAS = "id, numero, buyer_first_name, buyer_phone, etapa, etapa_at, tracking_code, status_raw, link_token";
const DIA_MS = 86_400_000;
const FATURADO = STATUS_FATURADO.join(",");
const ETAPAS = ETAPAS_DE_ENTREGA.join(",");

/** O que `escopo` precisa do builder do PostgREST (cada método devolve o próprio builder). */
type Filtravel<Q> = {
  eq(c: string, v: string): Q;
  in(c: string, v: readonly string[]): Q;
  is(c: string, v: null): Q;
  gte(c: string, v: string): Q;
  lte(c: string, v: string): Q;
  or(f: string): Q;
};

type RespostaDoHead = { count: number | null; error: { message: string } | null; status: number };

/** Copiada de `lib/stores/leads.ts`: contagem que não veio é erro, nunca zero. */
function contagemDoHead({ count, error, status }: RespostaDoHead): number {
  if (error) throw new Error(error.message || `HTTP ${status}`);
  if (count === null || !Number.isInteger(count)) throw new Error(`HTTP ${status} sem contagem`);
  return count;
}

const antes = (agora: Date, dias: number) => new Date(agora.getTime() - dias * DIA_MS).toISOString();

/** `escopo` e o chip usam esta mesma regra: a lista e o número nunca discordam. */
function escopo<Q extends Filtravel<Q>>(q: Q, filtro: FiltroDeEntregas, agora: Date): Q {
  const semCodigoAte = antes(agora, DIAS_SEM_CODIGO);
  const r = q.gte("etapa_at", antes(agora, JANELA_DIAS));
  switch (filtro) {
    case "a_caminho":
      return r.in("etapa", ["enviado", "retirada"]);
    case "sem_codigo":
      return r.eq("etapa", "separando").is("tracking_code", null).in("status_raw", STATUS_FATURADO).lte("etapa_at", semCodigoAte);
    case "problema":
      return r.eq("etapa", "problema");
    case "entregues":
      return r.eq("etapa", "entregue");
    default:
      // todos e whatsapp_falhou (este só acrescenta a junção, no select e nos filtros do embed)
      return r.or(
        `etapa.in.(${ETAPAS}),and(etapa.eq.separando,tracking_code.is.null,status_raw.in.(${FATURADO}),etapa_at.lte.${semCodigoAte})`,
      );
  }
}

const JUNCAO_AVISOS = "tracking_notices!inner(id)";
const DIAS_RECENTES = 7;

/** Pedidos com aviso de WhatsApp que falhou: o mesmo filtro da lista e do chip. */
function comWhatsappFalho<Q extends Filtravel<Q>>(q: Q, tenantId: string): Q {
  return q.eq("tracking_notices.channel", "whatsapp").eq("tracking_notices.status", "falhou").eq("tracking_notices.tenant_id", tenantId);
}

/** Início do dia de Brasília em UTC. */
// ponytail: UTC−3 fixo desde 2019 (sem horário de verão); se voltar, usar Intl.
const inicioDoDia = (agora: Date) => `${dayBR(agora)}T03:00:00.000Z`;

/** `*` também: o PostgREST o lê como curinga no `like`. */
function escaparLike(t: string): string {
  return t.replace(/[\\%_*]/g, (c) => `\\${c}`);
}

type Busca = { campo: "doc_hmac" | "numero" | "buyer_first_name"; valor: string; like: boolean };

/** Tem cara de CPF (11 dígitos) ou de CNPJ (12 alfanuméricos + 2 dígitos), com ou sem `.`, `-`, `/` e espaços. */
function temCaraDeDocumento(t: string): boolean {
  const limpo = t.replace(/[.\-/\s]/g, "").toUpperCase();
  return /^\d{11}$/.test(limpo) || /^[0-9A-Z]{12}\d{2}$/.test(limpo);
}

/**
 * documento → HMAC (exige o pepper antes de qualquer consulta); só dígitos → número; senão primeiro nome.
 * `"nenhum"`: a busca não casa com nada e não vai ao banco — documento digitado errado (nunca cai na busca por
 * número ou nome, para o documento não andar na URL do PostgREST) ou nome de 1 letra (não lista a loja inteira).
 */
function classificarBusca(busca: string | null): Busca | "nenhum" | null {
  const t = busca?.trim() ?? "";
  if (!t) return null;
  const doc = normalizarDocumento(t);
  if (doc) return { campo: "doc_hmac", valor: docHmac(doc.digitos, pepperDoRastreio()), like: false };
  if (temCaraDeDocumento(t)) return "nenhum";
  const digitos = t.replace(/^#/, "");
  if (/^\d+$/.test(digitos)) return { campo: "numero", valor: `${escaparLike(digitos)}%`, like: true };
  const nome = t.split(/\s+/)[0];
  return nome.length >= 2 ? { campo: "buyer_first_name", valor: `${escaparLike(nome)}%`, like: true } : "nenhum";
}

type LinhaDoPedido = {
  id: string; numero: string; buyer_first_name: string | null; buyer_phone: string | null; etapa: Etapa; etapa_at: string;
  tracking_code: string | null; status_raw: string; link_token: string;
};

function pedidoDaLinha(l: LinhaDoPedido): PedidoDaLista {
  return {
    id: l.id, numero: l.numero, buyerFirstName: l.buyer_first_name, buyerPhone: l.buyer_phone, etapa: l.etapa,
    etapaAt: l.etapa_at, trackingCode: l.tracking_code, statusRaw: l.status_raw, linkToken: l.link_token,
  };
}

export async function listarEntregas(
  tenantId: string,
  c: ConsultaDeEntregas,
): Promise<{ pedidos: PedidoDaLista[]; avisos: AvisoDoPedido[]; total: number }> {
  const busca = c.pedidoId ? null : classificarBusca(c.busca); // pepper ausente falha aqui, antes do banco
  if (busca === "nenhum") return { pedidos: [], avisos: [], total: 0 };
  const comAviso = !c.pedidoId && c.filtro === "whatsapp_falhou";
  const select = comAviso ? `${COLUNAS}, ${JUNCAO_AVISOS}` : COLUNAS;
  /** A lista e o HEAD de depois do fim passam pelos mesmos filtros. */
  const filtrada = (head: boolean) => {
    let q = getSupabaseAdmin().from(ORDERS).select(select, { count: "exact", head }).eq("tenant_id", tenantId);
    if (c.pedidoId) return q.eq("id", c.pedidoId);
    q = escopo(q, c.filtro, c.agora);
    if (comAviso) q = comWhatsappFalho(q, tenantId);
    if (busca) q = busca.like ? q.ilike(busca.campo, busca.valor) : q.eq(busca.campo, busca.valor);
    return q;
  };
  const de = c.pedidoId ? 0 : (Math.max(1, c.pagina) - 1) * POR_PAGINA; // o sininho ignora a página
  const resposta = await filtrada(false).order("etapa_at", { ascending: false }).range(de, de + POR_PAGINA - 1);
  // Página depois do fim: o PostgREST responde 416 (PGRST103) sem contagem; o total vem de um HEAD do mesmo escopo.
  if (resposta.status === 416 || resposta.error?.code === "PGRST103") {
    return { pedidos: [], avisos: [], total: contagemDoHead(await filtrada(true)) };
  }
  const total = contagemDoHead(resposta); // sem Content-Range é erro, nunca zero
  const pedidos = ((resposta.data ?? []) as unknown as LinhaDoPedido[]).map(pedidoDaLinha);
  return { pedidos, avisos: await avisosDosPedidos(tenantId, pedidos.map((p) => p.id)), total };
}

/** Uma consulta para a página inteira: no máximo 10 avisos por pedido (5 etapas × 2 canais), cabem nas 1000 linhas. */
async function avisosDosPedidos(tenantId: string, ids: string[]): Promise<AvisoDoPedido[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabaseAdmin()
    .from(NOTICES)
    .select("order_id, etapa, channel, status")
    .eq("tenant_id", tenantId)
    .in("order_id", ids);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as { order_id: string; etapa: Etapa; channel: Canal; status: AvisoStatus }[]).map((a) => ({
    orderId: a.order_id, etapa: a.etapa, canal: a.channel, status: a.status,
  }));
}

function headDePedidos(tenantId: string, select = "id") {
  return getSupabaseAdmin().from(ORDERS).select(select, { count: "exact", head: true }).eq("tenant_id", tenantId);
}

function headDeAvisos(tenantId: string, canal: Canal, agora: Date) {
  return getSupabaseAdmin()
    .from(NOTICES)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("channel", canal)
    .in("status", ["enviado", "entregue", "lido"])
    .gte("sent_at", inicioDoDia(agora));
}

export async function numerosDasEntregas(tenantId: string, agora: Date): Promise<NumerosDasEntregas> {
  const chip = (f: FiltroDeEntregas) => escopo(headDePedidos(tenantId), f, agora);
  const whatsappFalhou = comWhatsappFalho(escopo(headDePedidos(tenantId, `id, ${JUNCAO_AVISOS}`), "whatsapp_falhou", agora), tenantId);
  const r = await Promise.all([
    chip("todos"),
    chip("a_caminho"),
    chip("sem_codigo"),
    chip("problema"),
    whatsappFalhou,
    headDePedidos(tenantId).eq("etapa", "entregue").gte("etapa_at", antes(agora, DIAS_RECENTES)),
    headDeAvisos(tenantId, "whatsapp", agora),
    headDeAvisos(tenantId, "email", agora),
  ]);
  const [todos, aCaminho, semCodigo, problema, whatsapp, entregues, avisosWhatsapp, avisosEmail] = r.map(contagemDoHead);
  return {
    todos, aCaminho, semCodigo, problema, whatsappFalhou: whatsapp, entreguesEm7Dias: entregues,
    avisosHoje: { whatsapp: avisosWhatsapp, email: avisosEmail },
  };
}

export async function saudeDoCodigo(tenantId: string, agora: Date): Promise<SaudeDoCodigo> {
  // Pedidos que já deviam ter código: enviado/retirada/problema/entregue, ou separando já em transporte.
  const base = () =>
    headDePedidos(tenantId)
      .or(`etapa.in.(${ETAPAS}),and(etapa.eq.separando,status_raw.eq.on_carriage)`)
      .gte("etapa_at", antes(agora, DIAS_RECENTES));
  const [enviados, comCodigo, antigo] = await Promise.all([
    base(),
    base().not("tracking_code", "is", null),
    escopo(getSupabaseAdmin().from(ORDERS).select("id, numero, etapa_at" as string) // `as string`: o literal estoura o parser de tipos (TS2589)
      .eq("tenant_id", tenantId), "sem_codigo", agora)
      .order("etapa_at", { ascending: true })
      .limit(1),
  ]);
  if (antigo.error) throw new Error(antigo.error.message);
  const l = ((antigo.data ?? []) as unknown as { id: string; numero: string; etapa_at: string }[])[0];
  return {
    enviados: contagemDoHead(enviados),
    comCodigo: contagemDoHead(comCodigo),
    maisAntigoSemCodigo: l ? { id: l.id, numero: l.numero, desde: l.etapa_at } : null,
  };
}
