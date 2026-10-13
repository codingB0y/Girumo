import { z } from "zod";

/**
 * Cliente HTTP da API v3 do Bling: um por execução e loja.
 *
 * O limite do Bling (3 req/s e 120 mil/dia) é POR CONTA e soma todos os apps dela, e 300
 * erros em 10 s bloqueiam o IP por 10 min. Por isso o ritmo e o recuo são nossos: 350 ms
 * entre o início de duas chamadas (novas tentativas contam), 429 recua 1/2/4 s (o Bling
 * não manda Retry-After), 5xx/rede/timeout tentam mais 2 vezes. Quem decide parar a loja
 * (disjuntor, pausa) é o motor, pelo `tipo` do erro.
 *
 * Sem `server-only`: tudo que é de servidor (token, relógio, fetch) chega injetado.
 */

export const BLING_API_BASE = "https://api.bling.com.br/Api/v3";

const INTERVALO_MS = 350;
const TIMEOUT_MS = 15_000;
const ESPERAS_LIMITE = [1_000, 2_000, 4_000];
const ESPERAS_TRANSITORIO = [1_000, 3_000];
/** O motor grava a mensagem em `last_error`: corta texto grande vindo de fora. */
const MAX_DETALHE = 200;

/** Erro do Bling (`{"error":{"type","message"}}`) ou OAuth (`{"error":"…"}`), o que vier. */
const corpoDeErro = z.object({
  error: z.union([z.string(), z.object({ type: z.string().optional(), message: z.string().optional() })]),
});

export type TipoErroBling = "auth" | "escopo" | "nao_encontrado" | "limite" | "transitorio" | "invalido";

export class ErroBling extends Error {
  readonly tipo: TipoErroBling;
  /** null = não houve resposta HTTP que explique o erro (rede, timeout, corpo inesperado). */
  readonly status: number | null;

  constructor(tipo: TipoErroBling, status: number | null, mensagem: string) {
    super(mensagem);
    this.name = "ErroBling";
    this.tipo = tipo;
    this.status = status;
  }
}

export type Query = Record<string, string | number | ReadonlyArray<string | number> | undefined>;

export type OpcoesCliente = {
  /** Access token vigente. */
  token: () => Promise<string>;
  /** Força renovação; chamado no máximo 1x por requisição (num 401). */
  renovar: () => Promise<string>;
  fetchImpl?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  agora?: () => number;
  intervaloMs?: number;
  timeoutMs?: number;
};

export type ClienteBling = { get(caminho: string, query?: Query): Promise<unknown> };

type Resposta = { status: number; corpo: string };

export function criarClienteBling(opcoes: OpcoesCliente): ClienteBling {
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  const esperar = opcoes.esperar ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const agora = opcoes.agora ?? Date.now;
  const intervaloMs = opcoes.intervaloMs ?? INTERVALO_MS;
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_MS;
  let proximaVez = Number.NEGATIVE_INFINITY;

  /**
   * Reserva a vez ANTES de esperar: duas chamadas em paralelo ganham vezes seguidas
   * (0, 350, 700…). Ler o último início e esperar deixaria as duas saírem juntas.
   */
  async function aguardarVez(): Promise<void> {
    const inicio = Math.max(agora(), proximaVez);
    proximaVez = inicio + intervaloMs;
    const espera = inicio - agora();
    if (espera > 0) await esperar(espera);
  }

  /** null = não chegou resposta inteira (rede, timeout, corpo cortado no meio). */
  async function buscar(url: string, token: string): Promise<Resposta | null> {
    try {
      const res = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "enable-jwt": "1" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { status: res.status, corpo: await res.text() };
    } catch {
      // O erro do fetch fica de fora de propósito: a validação de header do undici cita o valor
      // (o token). O tipo "transitorio" e o caminho bastam para o motor e para o log.
      return null;
    }
  }

  return {
    async get(caminho, query) {
      const url = montarUrl(caminho, query);
      let token = await opcoes.token();
      let renovou = false;
      let limites = 0;
      let falhas = 0;
      for (;;) {
        await aguardarVez();
        const r = await buscar(url, token);
        if (r && r.status >= 200 && r.status < 300) return lerJson(r, caminho);
        if (r?.status === 401 && !renovou) {
          renovou = true;
          token = await opcoes.renovar();
        } else if (r?.status === 429 && limites < ESPERAS_LIMITE.length) {
          await esperar(ESPERAS_LIMITE[limites]);
          limites += 1;
        } else if ((r === null || r.status >= 500) && falhas < ESPERAS_TRANSITORIO.length) {
          await esperar(ESPERAS_TRANSITORIO[falhas]);
          falhas += 1;
        } else {
          throw erroFinal(r, caminho);
        }
      }
    },
  };
}

/** Lista no formato PHP que o Bling lê (`chave[]=a&chave[]=b`); `undefined` some. */
function montarUrl(caminho: string, query: Query = {}): string {
  const pares = Object.entries(query).flatMap(([chave, valor]) => {
    if (valor === undefined) return [];
    const k = encodeURIComponent(chave);
    if (typeof valor === "object") return valor.map((v) => `${k}[]=${encodeURIComponent(String(v))}`);
    return [`${k}=${encodeURIComponent(String(valor))}`];
  });
  return `${BLING_API_BASE}${caminho}${pares.length > 0 ? `?${pares.join("&")}` : ""}`;
}

function lerJson(r: Resposta, caminho: string): unknown {
  if (r.status === 204 || r.corpo.trim() === "") return null;
  try {
    return JSON.parse(r.corpo);
  } catch {
    throw new ErroBling("invalido", r.status, `Bling: resposta de ${caminho} não é JSON`);
  }
}

function erroFinal(r: Resposta | null, caminho: string): ErroBling {
  if (r === null) return new ErroBling("transitorio", null, `Bling: sem resposta em ${caminho} (rede ou tempo esgotado)`);
  const { status } = r;
  if (status === 401) return new ErroBling("auth", status, `Bling recusou o token em ${caminho} mesmo depois de renovar`);
  if (status === 429) return new ErroBling("limite", status, `Bling: limite de requisições atingido em ${caminho}`);
  if (status >= 500) return new ErroBling("transitorio", status, `Bling: HTTP ${status} em ${caminho}`);
  if (status === 403) return new ErroBling("escopo", status, `Bling: falta permissão no app para ${caminho}`);
  if (status === 404) return new ErroBling("nao_encontrado", status, `Bling: ${caminho} não encontrado`);
  return new ErroBling("invalido", status, `Bling recusou ${caminho}: HTTP ${status}${detalheDoErro(r.corpo)}`);
}

/**
 * Só `error.type` e `error.message` (`{"error":{"type","message"}}`) ou o código OAuth
 * (`{"error":"…"}`). `description` e `fields` ficam de fora: podem citar dado do cliente.
 */
function detalheDoErro(corpo: string): string {
  const erro = corpoDeErro.safeParse(jsonOuNull(corpo));
  if (!erro.success) return "";
  const { error } = erro.data;
  const partes = typeof error === "string" ? [error] : [error.type, error.message];
  const detalhe = partes.filter(Boolean).join(": ").replace(/\s+/g, " ").trim().slice(0, MAX_DETALHE);
  return detalhe ? ` — ${detalhe}` : "";
}

/** Corpo de erro sem JSON (página HTML de proxy) só não tem detalhe: o HTTP já diz o bastante. */
function jsonOuNull(corpo: string): unknown {
  try {
    return JSON.parse(corpo);
  } catch {
    return null;
  }
}
