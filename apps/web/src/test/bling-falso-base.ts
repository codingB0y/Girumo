/**
 * Base do mundo falso do motor do Bling (ver `bling-falso.ts`): constantes, fixtures, os tipos
 * do estado e os ajudantes que as stores e o Bling falsos dividem. Não importa os outros
 * `bling-falso-*`: é o fundo da pilha, sem ciclo.
 */
import type { DepsBling } from "@/lib/bling/deps";
import type { CampanhaComMetadata } from "@/lib/bling/eventos-meta";
import type { CredenciaisBling } from "@/lib/bling/oauth";
import type { ContatoBling, PedidoResumo, SituacaoBling } from "@/lib/bling/tipos";
import type { GraphError } from "@/lib/campaigns/meta-capi";
import { impressaoDaChave, selar } from "@/lib/security/secret-box";
import { contextoDoToken, type AtualizacaoConexao, type ConexaoBling } from "@/lib/stores/bling-conexoes";
import type { ContatoGuardado } from "@/lib/stores/bling-contatos";
import type { LinhaPedidoBling } from "@/lib/stores/bling-pedidos";
import type { CadastroDaVenda } from "@/lib/stores/site-captures";
import type { SaleLead } from "@/lib/stores/vendas";

export const MINUTO = 60_000;
export const HORA = 60 * MINUTO;
export const DIA = 24 * HORA;
export const LOJA = "loja-1";
/** 15:00 UTC = 12:00 em São Paulo, 13/10/2026. */
export const AGORA = Date.parse("2026-10-13T15:00:00.000Z");
export const CHAVE = Buffer.alloc(32, 7);
export const PIXEL = "1234567890";
export const TOKEN_META = `EAAG${"t".repeat(60)}`;
/** `phone_key` do celular da Maria: DDD + 8 últimos. */
export const CHAVE_DA_MARIA = "6299998888";
/**
 * A vida da função de cada gatilho quando a execução começa (o `maxDuration` da rota): o motor só começa
 * uma chamada com efeito (Meta, /oauth/token) que termina dentro dela.
 */
export const VIDA = { aviso: 60_000, cron: 300_000, conexao: 300_000 } as const;

export const iso = (ms: number): string => new Date(ms).toISOString();

export function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

export const SITUACOES: readonly SituacaoBling[] = [
  { id: 6, nome: "Em aberto", base: 6 },
  { id: 9, nome: "Atendido", base: 9 },
  { id: 12, nome: "Cancelado", base: 12 },
  { id: 21, nome: "Em digitação", base: 21 },
  { id: 4321, nome: "Pago no Pix", base: 9 },
];

export const MARIA: ContatoBling = {
  id: 77,
  nome: "Maria da Silva",
  tipo: "F",
  celular: "(62) 99999-8888",
  telefone: null,
  email: "Maria@Exemplo.com",
  emailNotaFiscal: null,
  municipio: "Goiânia",
  uf: "GO",
  cep: "74000-000",
  pais: "Brasil",
  dataNascimento: "1990-05-20",
  sexo: "F",
};

export const LEAD_MARIA: SaleLead = {
  id: "lead-1",
  name: "Maria",
  phone: "5562999998888",
  source_campaign: null,
  source_group_id: "vip1@g.us",
  source_group_name: "VIP 1",
};

export function campanha(id: string, pixel: string, testCode = ""): CampanhaComMetadata {
  const meta = { pixel_id: pixel, evento: "Lead", capi_token: TOKEN_META, test_code: testCode };
  return { id, name: `Campanha ${id}`, metadata: { settings: { integracoes: { meta } } } };
}

/** Pedido de venda de hoje, Atendido, R$ 350, da Maria. `numero` = id + 49. */
export function pedidoDoBling(id: number, extra: Partial<PedidoResumo> = {}): PedidoResumo {
  return { id, numero: String(id + 49), data: "2026-10-13", total: 350, contatoId: MARIA.id, situacaoId: 9, ...extra };
}

/**
 * A linha da fila com o que a store não devolve e o teste quer ver: as duas datas de envio e o
 * `low_priority` (pendência só do histórico, que a fila lista depois).
 */
export type LinhaFalsa = LinhaPedidoBling & { icSentAt: string | null; purchaseSentAt: string | null; lowPriority: boolean };

/** Linha recém-avisada: pendente, sem retrato, vencida há 1 min. */
export function linhaPendente(id: number, extra: Partial<LinhaFalsa> = {}): LinhaFalsa {
  return {
    tenantId: LOJA,
    blingOrderId: id,
    numero: null,
    orderDate: null,
    total: null,
    situacaoId: null,
    blingContactId: null,
    kind: null,
    orderId: null,
    origin: "aviso",
    firstSeenAt: iso(AGORA - HORA),
    saleAt: null,
    icStatus: null,
    icSentAt: null,
    purchaseStatus: null,
    purchaseSentAt: null,
    metaError: null,
    origem: null,
    origemDetalhe: null,
    snapshot: null,
    pending: true,
    attempts: 0,
    nextTryAt: iso(AGORA - MINUTO),
    lastError: null,
    updatedAt: `inicial-${id}`,
    lowPriority: false,
    ...extra,
  };
}

/** A Maria já no cache de contatos, lida há 1 h. */
export function mariaGuardada(extra: Partial<ContatoGuardado> = {}): ContatoGuardado {
  return {
    blingContactId: MARIA.id,
    name: MARIA.nome,
    personType: "F",
    phone: LEAD_MARIA.phone,
    phoneKey: CHAVE_DA_MARIA,
    metaHashes: { ph: ["hash-do-celular"], external_id: "hash-da-chave" },
    lista: null,
    fetchedAt: iso(AGORA - HORA),
    ...extra,
  };
}

/** Loja ativa, tokens válidos por 5 h, situações lidas há 1 h, histórico feito, varrida há 1 min. */
export function conexaoPadrao(): ConexaoBling {
  return {
    tenantId: LOJA,
    companyId: "empresa-1",
    companyName: "Moda da Ana",
    status: "ativa",
    accessTokenEnc: selar("access-1", contextoDoToken(LOJA, "access"), CHAVE),
    refreshTokenEnc: selar("refresh-1", contextoDoToken(LOJA, "refresh"), CHAVE),
    accessExpiresAt: iso(AGORA + 5 * HORA),
    tokenVersion: 3,
    situations: SITUACOES.map((s) => ({ ...s })),
    situationsAt: iso(AGORA - HORA),
    saleSituationIds: [9, 4321],
    highValue: 500,
    metaEnabled: true,
    metaCampaignId: null,
    backfillFrom: "2026-07-15",
    backfillUntil: "2026-10-13",
    backfillPage: 1,
    backfillFails: 0,
    backfillDoneAt: iso(AGORA - DIA),
    scanCursor: iso(AGORA - 10 * MINUTO),
    pausedUntil: null,
    consecutiveFailures: 0,
    lastWebhookAt: null,
    lastScanAt: iso(AGORA - MINUTO),
    lastScanChangeAt: null,
    lastSaleAt: null,
    lastError: null,
    lastErrorAt: null,
    reconnectAlertedAt: null,
    connectedAt: iso(AGORA - 30 * DIA),
    keyFp: impressaoDaChave(CHAVE),
    tokenRetryAt: null,
    scanFrom: null,
    scanSliceS: null,
  };
}

export type ChamadaBling = { metodo: string; caminho: string; query: URLSearchParams; token: string | null };
/** Resposta no lugar da normal para o caminho que casar, `vezes` vezes (Infinity = sempre). Pode ter efeito. */
export type RespostaForcada = { caminho: RegExp; vezes: number; resposta: () => Response };

export type BlingRemoto = {
  chamadas: ChamadaBling[];
  pedidos: Map<number, PedidoResumo>;
  contatos: Map<number, ContatoBling>;
  situacoes: SituacaoBling[];
  /** GET /pedidos/vendas: a página pela query (lista vazia = acabou). */
  paginas: (query: URLSearchParams) => PedidoResumo[];
  forcadas: RespostaForcada[];
  aceitos: Set<string>;
  refreshValido: string;
  emitidos: number;
  /** Todo GET da API volta 401, com qualquer token. */
  recusaTudo: boolean;
  /** Resposta do /oauth/token no lugar da normal. */
  oauth: (() => Response) | null;
};

export type CadastroFalso = CadastroDaVenda & { phoneKey: string; criadoEm: number };
export type PedidoGirumo = { id: string; total: number; telefone: string | null; saleAt: number; lead: SaleLead | null };
export type EnvioMeta = Parameters<DepsBling["meta"]["enviar"]>[0];
export type EmailFalso = { to: string; subject: string; html: string; kind: string };

export type Estado = {
  agora: number;
  conexao: ConexaoBling | null;
  trava: { dono: string; ate: number } | null;
  pedidos: Map<number, LinhaFalsa>;
  contatos: Map<number, ContatoGuardado>;
  girumo: Map<string, PedidoGirumo>;
  leads: SaleLead[];
  cadastros: CadastroFalso[];
  campanhas: CampanhaComMetadata[];
  /** Telefones no descadastro da loja, como o `optouts.phone` guarda (só dígitos, em qualquer formato). */
  optouts: string[];
  /** `raw` = o erro cru da Graph, como o `sendCapiEvent` devolve (com o `fbtrace_id`). */
  meta: { enviados: EnvioMeta[]; resposta: { ok: boolean; error?: string; raw?: GraphError } };
  credenciais: CredenciaisBling | null;
  chave: Buffer | null;
  limiteToken: boolean;
  emails: EmailFalso[];
  atualizacoes: AtualizacaoConexao[];
  trilha: string[];
  /** Vê cada entrada da trilha: simula o que acontece "no meio" (aviso chegando, ajuste do cartão). */
  gancho: ((entrada: string) => void) | null;
  bling: BlingRemoto;
  contadores: { versoes: number; donos: number; pedidosGirumo: number };
};

export function registrar(e: Estado, entrada: string): void {
  e.trilha.push(entrada);
  e.gancho?.(entrada);
}

export function daLoja(tenantId: string): void {
  if (tenantId !== LOJA) throw new Error(`bling-falso: consulta de outra loja (${tenantId})`);
}

/** O `updated_at` que o banco trocaria: a guarda dos UPDATEs compara com ele. */
export function novaVersao(e: Estado): string {
  e.contadores.versoes += 1;
  return `versao-${e.contadores.versoes}`;
}
