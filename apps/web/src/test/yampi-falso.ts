/**
 * O mundo falso da Yampi para os testes de `lib/yampi/*` e das rotas do cartão: um PostgREST de mentira (com o
 * dono logado por Bearer) e um `fetch` que responde `https://api.dooki.com.br/v2/` pelo combinado em cada teste.
 * O que os testes mudam (papel, loja, banco, Yampi) fica em cada arquivo: o falso só lê o estado.
 * Rota sem resposta combinada → 500 `{ message: "inesperado: <rota>" }`.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before } from "node:test";

import { selar } from "@/lib/security/secret-box";
import { contextoDoSegredo } from "@/lib/yampi/credenciais";

export const TENANT = "loja-b";
export const ALIAS = "loja-exemplo";
export const CONEXAO_ID = "4f8c2d1e-9b3a-4c7d-8e5f-1a2b3c4d5e6f";
export const CHAVE = Buffer.alloc(32, 7);
export const ENV = {
  INTEGRATIONS_ENCRYPTION_KEY: CHAVE.toString("base64"),
  NEXT_PUBLIC_APP_URL: "https://app.girumo.test",
  CRON_SECRET: "segredo-do-cron-com-mais-de-24-caracteres",
};
export const TOKEN = ["Zk3pQ9vL2x", "W8cR5tN7mB4y"].join(""); // em pedaços: o scan de secrets
export const CHAVE_SECRETA = ["h6jD1fG0aS", "e2uV7oK9nT3q"].join("");
export const SEGREDO_DO_AVISO = ["s3gR3d0d0", "Av1s0Yamp1x"].join("");

export type RespostaFalsa = [status: number, corpo: unknown, cabecalhos?: Record<string, string>];
export type Chamada = { metodo: string; url: URL; corpo: unknown };
export type ChamadaYampi = { metodo: string; caminho: string; consulta: URLSearchParams; cabecalhos: Record<string, string>; corpo: unknown };

export type EstadoYampiFalso = {
  /** Papel do usuário logado por Bearer; padrão "owner". */
  papel: () => string;
  /** Loja do usuário; padrão TENANT. */
  tenant?: () => string;
  /** "GET /rest/v1/yampi_connections" → resposta; lista = em sequência, a última se repete. */
  banco: () => Record<string, RespostaFalsa | RespostaFalsa[]>;
  /** "GET /loja-exemplo/orders" → resposta (host api.dooki.com.br, sem o /v2). */
  yampi: () => Record<string, RespostaFalsa | RespostaFalsa[]>;
  chamadas: Chamada[];
  chamadasYampi: ChamadaYampi[];
  /** "db GET yampi_connections" / "yampi POST /loja-exemplo/webhooks": a ordem entre os dois mundos. */
  linhaDoTempo: string[];
};

const YAMPI = "https://api.dooki.com.br/v2";
const consumidas = new WeakMap<RespostaFalsa[], number>();

/** Uma resposta só, ou a próxima da sequência (a última se repete). Cada lista nova recomeça. */
function proxima(entrada: RespostaFalsa | RespostaFalsa[] | undefined, rota: string): RespostaFalsa {
  if (!entrada) return [500, { message: `inesperado: ${rota}` }];
  if (typeof entrada[0] === "number") return entrada as RespostaFalsa;
  const lista = entrada as RespostaFalsa[];
  const i = consumidas.get(lista) ?? 0;
  consumidas.set(lista, i + 1);
  return lista[Math.min(i, lista.length - 1)];
}

function corpoDe(bruto: string): unknown {
  if (!bruto) return undefined;
  try {
    return JSON.parse(bruto);
  } catch {
    return bruto;
  }
}

/** Liga o mundo falso no arquivo de teste (before/after). */
export function servirYampi(estado: EstadoYampiFalso): void {
  const supabase = createServer((req, res) => {
    let bruto = "";
    req.on("data", (parte: Buffer) => (bruto += parte));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://supabase.falso");
      const metodo = req.method ?? "";
      const chamada = { metodo, url, corpo: corpoDe(bruto) };
      estado.chamadas.push(chamada);
      estado.linhaDoTempo.push(`db ${metodo} ${url.pathname.replace(/^\/rest\/v1\//, "")}`);
      let resposta: RespostaFalsa;
      if (url.pathname === "/auth/v1/user") resposta = [200, { id: "usuario-1", email: "dono@loja.test" }];
      else if (url.pathname === "/rest/v1/memberships") {
        resposta = [200, [{ tenant_id: estado.tenant?.() ?? TENANT, role: estado.papel(), modules: [] }]];
      } else resposta = proxima(estado.banco()[`${metodo} ${url.pathname}`], `${metodo} ${url.pathname}`);
      const [status, corpo, cabecalhos = {}] = resposta;
      res.setHeader("Content-Type", "application/json");
      for (const [nome, valor] of Object.entries(cabecalhos)) res.setHeader(nome, valor);
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
      const texto = entrada instanceof Request ? entrada.url : String(entrada);
      if (!texto.startsWith(`${YAMPI}/`)) return fetchOriginal(entrada, init);
      const url = new URL(texto);
      const metodo = (init?.method ?? "GET").toUpperCase();
      const caminho = url.pathname.replace(/^\/v2/, "");
      const cabecalhos: Record<string, string> = {};
      new Headers(init?.headers).forEach((valor, nome) => { cabecalhos[nome] = valor; });
      estado.chamadasYampi.push({ metodo, caminho, consulta: url.searchParams, cabecalhos, corpo: corpoDe(String(init?.body ?? "")) });
      estado.linhaDoTempo.push(`yampi ${metodo} ${caminho}`);
      const [status, corpo, extras = {}] = proxima(estado.yampi()[`${metodo} ${caminho}`], `${metodo} ${caminho}`);
      const semCorpo = status === 204;
      return new Response(semCorpo ? null : JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...extras } });
    }) as typeof fetch;
  });
  after(() => {
    globalThis.fetch = fetchOriginal;
    supabase.close();
  });
}

/** Linha de `yampi_connections` com token, chave e segredo do aviso SELADOS para `tenant`. */
export function linhaDaConexao(over: Record<string, unknown> = {}, tenant: string = TENANT): Record<string, unknown> {
  return {
    id: CONEXAO_ID, tenant_id: tenant, alias: ALIAS,
    user_token: selar(TOKEN, contextoDoSegredo(tenant, "user_token"), CHAVE),
    user_secret_key: selar(CHAVE_SECRETA, contextoDoSegredo(tenant, "user_secret_key"), CHAVE),
    webhook_id: "5611397",
    webhook_secret: selar(SEGREDO_DO_AVISO, contextoDoSegredo(tenant, "webhook_secret"), CHAVE),
    status: "ativa", last_event_at: null, last_check_at: null, last_error: null,
    ...over,
  };
}
