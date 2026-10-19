/**
 * O mundo falso da rota do cartão do Bling (`app/api/integracoes/bling/route.ts`), para os testes dela
 * (`route.test.ts`: desconectar e o cartão; `route-ajustes.test.ts`: os ajustes): o dono logado por
 * Bearer contra um PostgREST de mentira, a revogação do Bling num fetch falso, e as linhas que o cartão
 * lê. O que os testes mudam (papel, conexão, resto do banco, Bling fora, chamada recusada) fica em cada
 * arquivo: o falso só lê.
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before } from "node:test";

import { selar } from "@/lib/security/secret-box";
import { contextoDoToken } from "@/lib/stores/bling-conexoes";

export type Chamada = { metodo: string; url: URL; corpo: unknown };

export type EstadoDoCartao = {
  /** Cada chamada ao banco, na ordem. */
  chamadas: Chamada[];
  papel: () => string;
  conexao: () => Record<string, unknown> | null;
  /** Respostas do resto do banco por caminho; caminho ausente responde 500. */
  banco: () => Record<string, unknown>;
  /** O token de cada revogação que chegou ao Bling. */
  revogacoes?: string[];
  blingFora?: () => boolean;
  /** A chamada que o banco recusa (500), já registrada em `chamadas`. */
  recusar?: (chamada: Chamada) => boolean;
};

export const ENV = {
  BLING_CLIENT_ID: "app-girumo",
  BLING_CLIENT_SECRET: "segredo-do-app",
  INTEGRATIONS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};
export const CHAVE = Buffer.alloc(32, 7);
export const REFRESH = "refresh-da-loja-b";

function responder(estado: EstadoDoCartao, metodo: string, url: URL): [number, unknown] {
  const conexao = estado.conexao();
  const banco = estado.banco();
  if (url.pathname === "/auth/v1/user") return [200, { id: "usuario-1", email: "dono@loja.test" }];
  if (url.pathname === "/rest/v1/memberships") return [200, [{ tenant_id: "loja-b", role: estado.papel(), modules: [] }]];
  if (url.pathname === "/rest/v1/bling_connections") return [200, metodo === "GET" && conexao ? [conexao] : []];
  if (metodo === "PATCH" && url.pathname === "/rest/v1/bling_orders") return [200, []];
  // Os pedidos com canal (os canais de venda do cartão): a mesma tabela das últimas, outro select.
  if (url.pathname === "/rest/v1/bling_orders" && url.searchParams.get("select")?.includes("snapshot->lojaId")) {
    return "canais" in banco ? [200, banco.canais] : [500, { message: "inesperado: canais" }];
  }
  if (url.pathname in banco) return [200, banco[url.pathname]];
  return [500, { message: `inesperado: ${metodo} ${url.pathname}` }];
}

/** Liga o mundo falso no arquivo de teste; devolve os filtros das chamadas que os testes conferem. */
export function servirCartao(estado: EstadoDoCartao) {
  const supabase = createServer((req, res) => {
    let bruto = "";
    req.on("data", (parte: Buffer) => (bruto += parte));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://supabase.falso");
      const chamada = { metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : undefined };
      estado.chamadas.push(chamada);
      const [status, corpo] = estado.recusar?.(chamada)
        ? [500, { message: `recusada: ${chamada.metodo} ${url.pathname}` }]
        : responder(estado, chamada.metodo, url);
      res.setHeader("Content-Type", "application/json");
      res.statusCode = status;
      res.end(JSON.stringify(corpo));
    });
  });
  const fetchOriginal = globalThis.fetch;
  before(async () => {
    await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
    const { port } = supabase.address() as AddressInfo;
    process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
    process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
    globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = entrada instanceof Request ? entrada.url : String(entrada);
      if (!url.startsWith("https://api.bling.com.br/")) return fetchOriginal(entrada, init);
      estado.revogacoes?.push(new URLSearchParams(String(init?.body ?? "")).get("token") ?? "");
      const fora = estado.blingFora?.() ?? false;
      return new Response(fora ? "{}" : "", { status: fora ? 503 : 200 });
    }) as typeof fetch;
  });
  after(() => {
    globalThis.fetch = fetchOriginal;
    supabase.close();
  });
  return {
    gravacoes: () => estado.chamadas.filter((c) => c.url.pathname === "/rest/v1/bling_connections" && c.metodo === "PATCH"),
    /** Consultas a dado da loja (a sessão e a membership não contam). */
    doBanco: () => estado.chamadas.filter((c) => c.url.pathname.startsWith("/rest/v1/") && c.url.pathname !== "/rest/v1/memberships"),
  };
}

export function linha(refreshTokenEnc: string): Record<string, unknown> {
  return {
    tenant_id: "loja-b", company_id: "empresa-1", company_name: "Moda da Ana", status: "ativa",
    access_token_enc: selar("acesso-da-loja-b", contextoDoToken("loja-b", "access"), CHAVE), refresh_token_enc: refreshTokenEnc,
    access_expires_at: "2026-10-13T18:00:00+00:00", token_version: 2, situations: [], situations_at: null,
    sale_situation_ids: [9], high_value: null, meta_enabled: true, meta_campaign_id: null, meta_skip_store_ids: [], backfill_from: null,
    backfill_until: null, backfill_page: 1, backfill_done_at: null, scan_cursor: null, paused_until: null,
    consecutive_failures: 0, last_webhook_at: null, last_scan_at: null, last_scan_change_at: null, last_sale_at: null,
    last_error: null, last_error_at: null, reconnect_alerted_at: null, connected_at: "2026-10-13T12:00:00+00:00",
  };
}

const HORA_MS = 3_600_000;
export const haHoras = (h: number) => new Date(Date.now() - h * HORA_MS).toISOString();
export const CAMPANHA_A = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
export const CAMPANHA_C = "0e1f2a3b-4c5d-4e6f-8a9b-1c2d3e4f5a6b";
export const CAMPANHA_SEM_TOKEN = "7d6c5b4a-3e2f-4a1b-8c9d-0e1f2a3b4c5d";

/** As situações da conexão `conectada()`. */
export const SITUACOES = [
  { id: 6, nome: "Em aberto", base: 6 },
  { id: 9, nome: "Atendido", base: 9 },
  { id: 12, nome: "Cancelado", base: 12 },
  { id: 21, nome: "Em digitação", base: 21 },
  { id: 30, nome: "Pago", base: 9 },
];
/** A versão de uma lista de situações como o cartão a calcula: sha256 do JSON, 16 hex. Feita aqui, e não importada, para prender o contrato. */
export const versaoDe = (situacoes: readonly unknown[]) => createHash("sha256").update(JSON.stringify(situacoes)).digest("hex").slice(0, 16);
/** A versão das situações de `conectada()`: o que o GET devolve e o Salvar manda de volta. */
export const VERSAO = versaoDe(SITUACOES);

/** Conexão ativa recebendo: aviso há 1 h, erro de 2 h atrás, Pago (situação própria) fora da venda. */
export function conectada(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...linha(selar(REFRESH, contextoDoToken("loja-b", "refresh"), CHAVE)),
    company_name: "Moda Kids Atacado Ltda",
    situations: SITUACOES,
    situations_at: "2026-10-13T12:00:00+00:00",
    sale_situation_ids: ["9"], // bigint chega em texto
    sales_channels: [
      { id: 200000001, nome: "Loja Yampi", tipo: "Yampi", ativo: true },
      { id: 200000004, nome: "Loja física", tipo: "Api", ativo: true },
      { id: 200000005, nome: "Antiga", tipo: "Api", ativo: false },
    ],
    sales_channels_at: "2026-10-13T12:00:00+00:00",
    high_value: "1500.00",
    meta_campaign_id: CAMPANHA_A,
    last_webhook_at: haHoras(1),
    last_scan_change_at: haHoras(3),
    last_sale_at: haHoras(0.2),
    last_error: "Falta permissão no app do Bling",
    last_error_at: haHoras(2),
    ...over,
  };
}

const RESUMO = {
  vendas_30d: 214,
  vendido_30d: 86420.5,
  origem_30d: { anuncio: 61, grupo: 97, sem_origem: 56 },
  meta_30d: { enviado: 207, fora_da_janela: 6, sem_pixel: 0, sem_dados: 1, desligado: 0, erro: 0 },
  pendentes: 3,
  falhas: 1,
  historico_lidos: 1840,
  listas: { alto_valor: 38, comprador: 412, lead: 129 },
};
const PEDIDO_DO_BANCO = {
  tenant_id: "loja-b", bling_order_id: "5001", numero: "1050", order_date: "2026-10-13", total: "1840.00",
  situacao_id: "30", bling_contact_id: "555", kind: "venda", order_id: "ord-1", origin: "aviso",
  first_seen_at: "2026-10-13T17:50:00+00:00", sale_at: "2026-10-13T17:52:00+00:00", ic_status: "enviado",
  purchase_status: "enviado", meta_error: null, origem: "anuncio", origem_detalhe: "Verão · Kit 10 peças",
  snapshot: null, pending: false, attempts: 0, next_try_at: "2026-10-13T17:50:00+00:00", last_error: null,
  updated_at: "2026-10-13T17:52:01.123456+00:00",
};
const PEDIDOS = [
  PEDIDO_DO_BANCO,
  {
    ...PEDIDO_DO_BANCO, bling_order_id: "5000", kind: "pedido", total: "312.50", situacao_id: "6", bling_contact_id: "556",
    order_id: null, first_seen_at: "2026-10-13T16:00:00+00:00", sale_at: null, ic_status: "sem_pixel",
    purchase_status: null, origem: null, origem_detalhe: null,
  },
];
const CONTATOS = [
  { bling_contact_id: "555", name: "Ana Paula Ferreira", person_type: "F", phone: "5562999994821", phone_key: "6299994821", meta_hashes: { ph: ["h1"] }, lista: "alto_valor", fetched_at: "2026-10-13T17:50:00+00:00" },
  { bling_contact_id: "556", name: "Regiane Costa", person_type: "F", phone: null, phone_key: null, meta_hashes: {}, lista: "lead", fetched_at: "2026-10-13T16:00:00+00:00" },
];
function campanhaDoBanco(id: string, name: string, meta: Record<string, string>): Record<string, unknown> {
  return {
    id, tenant_id: "loja-b", name, slug: id.slice(0, 8), group_ids: [], auto_grow: false, grow_template: null,
    metadata: { settings: { integracoes: { meta } } }, whatsapp_community_jid: null,
    created_at: "2026-10-01T12:00:00+00:00", updated_at: "2026-10-01T12:00:00+00:00",
  };
}
const CAMPANHAS = [
  campanhaDoBanco(CAMPANHA_A, "VIP Goiânia", { pixel_id: "1234567890", capi_token: "EAAB-token-secreto", test_code: "TEST123" }),
  campanhaDoBanco(CAMPANHA_SEM_TOKEN, "VIP Kids", { pixel_id: "1234567890" }),
  campanhaDoBanco(CAMPANHA_C, "Moda Sul", { pixel_id: "5550001112", capi_token: "EAAB-outro-token" }),
];

/** O resto do banco de cada teste: o resumo, as últimas, os contatos, as campanhas e o recálculo das listas. */
export function bancoDoCartao(): Record<string, unknown> {
  return {
    "/rest/v1/rpc/bling_resumo": RESUMO,
    "/rest/v1/bling_orders": PEDIDOS,
    canais: [
      { numero: "1532", data: "2026-10-13", loja: 200000001 },
      { numero: "1531", data: "2026-10-12", loja: 200000001 },
    ],
    "/rest/v1/bling_contacts": CONTATOS,
    "/rest/v1/campaign_groups": CAMPANHAS,
    "/rest/v1/rpc/bling_recompute_lists": 2,
  };
}
