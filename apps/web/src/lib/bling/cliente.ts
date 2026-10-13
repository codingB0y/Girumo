import { z } from "zod";

/**
 * Cliente HTTP da API v3 do Bling: um por execução e loja.
 *
 * O limite do Bling (3 req/s e 120 mil/dia) é POR CONTA e soma todos os apps dela, e 300
 * erros em 10 s bloqueiam o IP por 10 min. Por isso o ritmo e o recuo são nossos: 350 ms
 * entre o início de duas chamadas (novas tentativas contam), 429 recua 1/2/4 s (o Bling
 * não manda Retry-After) — menos o da cota do dia, que não passa recuando —, 5xx/rede/timeout
 * tentam mais 2 vezes. Quem decide parar a loja (disjuntor, pausa) é o motor, pelo `tipo`
 * do erro. Com `prazo`, nenhuma espera nem chamada passa do fim da execução.
 *
 * Sem `server-only`: tudo que é de servidor (token, relógio, fetch) chega injetado.
 */

export const BLING_API_BASE = "https://api.bling.com.br/Api/v3";

/** Uma página de 100 pedidos tem dezenas de KB: bem acima disso não é o Bling, e não cabe ler na memória. */
export const TETO_RESPOSTA_BYTES = 5 * 1024 * 1024;

const INTERVALO_MS = 350;
const TIMEOUT_MS = 15_000;
/** O prazo encolhe a chamada, mas não abaixo disto: com menos nem dá para conectar. */
const TIMEOUT_MINIMO_MS = 1_000;
const ESPERAS_LIMITE = [1_000, 2_000, 4_000];
const ESPERAS_TRANSITORIO = [1_000, 3_000];
/** O motor grava a mensagem em `last_error`: corta texto grande vindo de fora. */
const MAX_DETALHE = 200;

/** Erro do Bling (`{"error":{"type","message"}}`) ou OAuth (`{"error":"…"}`), o que vier. */
const corpoDeErro = z.object({
  error: z.union([z.string(), z.object({ type: z.string().optional(), message: z.string().optional() })]),
});

/** Só o formato da API v3 (`error` objeto); o do 429 traz `period`: "second" ou "day". */
const erroDaApi = z.object({ error: z.looseObject({ period: z.string().optional().catch(undefined) }) });

export type TipoErroBling = "auth" | "escopo" | "nao_encontrado" | "limite" | "transitorio" | "invalido";
type PeriodoLimite = "segundo" | "dia";

export class ErroBling extends Error {
  readonly tipo: TipoErroBling;
  /** null = não houve resposta HTTP que explique o erro (rede, timeout, prazo, corpo inesperado). */
  readonly status: number | null;
  /** Só no `limite`. "dia" = acabou a cota de 120 mil: tentar de novo antes de virar o dia só gasta erro. */
  readonly periodo: PeriodoLimite | null;

  constructor(tipo: TipoErroBling, status: number | null, mensagem: string, periodo: PeriodoLimite | null = null) {
    super(mensagem);
    this.name = "ErroBling";
    this.tipo = tipo;
    this.status = status;
    this.periodo = periodo;
  }
}

export type Query = Record<string, string | number | ReadonlyArray<string | number> | undefined>;

export type OpcoesCliente = {
  /** Access token vigente. */
  token: () => Promise<string>;
  /** Força renovação. Uma por vez no cliente: o 401 que chega com outra em voo espera a dela. */
  renovar: () => Promise<string>;
  fetchImpl?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  agora?: () => number;
  intervaloMs?: number;
  timeoutMs?: number;
  /** Fim da execução (epoch ms, no relógio de `agora`): espera ou chamada que passaria dele vira `transitorio`. */
  prazo?: number;
};

export type ClienteBling = { get(caminho: string, query?: Query): Promise<unknown> };

type Resposta = { status: number; corpo: string };

export function criarClienteBling(opcoes: OpcoesCliente): ClienteBling {
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  const esperar = opcoes.esperar ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const agora = opcoes.agora ?? Date.now;
  const intervaloMs = opcoes.intervaloMs ?? INTERVALO_MS;
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_MS;
  const { prazo } = opcoes;
  let proximaVez = Number.NEGATIVE_INFINITY;
  let renovacaoEmVoo: Promise<string> | null = null;

  /** Espera que terminaria no prazo (ou depois) não deixaria tempo para a chamada. */
  function conferirPrazo(espera: number, caminho: string): void {
    if (prazo !== undefined && agora() + espera >= prazo) {
      throw new ErroBling("transitorio", null, `Bling: prazo da execução esgotado antes de ${caminho}`);
    }
  }

  /**
   * Reserva a vez ANTES de esperar: duas chamadas em paralelo ganham vezes seguidas
   * (0, 350, 700…). Ler o último início e esperar deixaria as duas saírem juntas.
   */
  async function aguardarVez(caminho: string): Promise<void> {
    const t = agora();
    const inicio = Math.max(t, proximaVez);
    conferirPrazo(inicio - t, caminho);
    proximaVez = inicio + intervaloMs;
    if (inicio > t) await esperar(inicio - t);
  }

  async function recuar(ms: number, caminho: string): Promise<void> {
    conferirPrazo(ms, caminho);
    await esperar(ms);
  }

  /** O refresh token rotaciona: uma segunda renovação em paralelo usaria o refresh que a primeira acabou de trocar. */
  function renovarUmaVez(): Promise<string> {
    return (renovacaoEmVoo ??= opcoes.renovar().finally(() => {
      renovacaoEmVoo = null;
    }));
  }

  /** 401: se o token mudou desde que a chamada saiu, outra já renovou; senão renova (ou entra na que está em voo). */
  async function tokenParaRepetir(usado: string): Promise<string> {
    const atual = await opcoes.token();
    return atual !== usado ? atual : renovarUmaVez();
  }

  /** Com prazo, a chamada acaba com ele; nunca abaixo do mínimo nem acima do `timeoutMs`. */
  function tempoDaChamada(): number {
    return prazo === undefined ? timeoutMs : Math.min(timeoutMs, Math.max(prazo - agora(), TIMEOUT_MINIMO_MS));
  }

  /** null = não chegou resposta inteira (rede, timeout, redirecionamento, corpo cortado no meio). */
  async function buscar(url: string, token: string, caminho: string): Promise<Resposta | null> {
    let r: { status: number; corpo: string | null };
    try {
      const res = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "enable-jwt": "1" },
        // A API não redireciona: redirecionamento é proxy ou portal no caminho, e a resposta dele não é do Bling.
        redirect: "error",
        signal: AbortSignal.timeout(tempoDaChamada()),
      });
      r = { status: res.status, corpo: await lerTextoComTeto(res, TETO_RESPOSTA_BYTES) };
    } catch {
      // O erro do fetch fica de fora de propósito: a validação de header do undici cita o valor
      // (o token). O tipo "transitorio" e o caminho bastam para o motor e para o log.
      return null;
    }
    // Não adianta tentar de novo: viria grande outra vez.
    if (r.corpo === null) throw new ErroBling("transitorio", null, `Bling: resposta grande demais em ${caminho}`);
    return { status: r.status, corpo: r.corpo };
  }

  return {
    async get(caminho, query) {
      const url = montarUrl(caminho, query);
      let token = await opcoes.token();
      let trocouToken = false;
      let limites = 0;
      let falhas = 0;
      for (;;) {
        await aguardarVez(caminho);
        const r = await buscar(url, token, caminho);
        if (r && r.status >= 200 && r.status < 300) return lerJson(r, caminho);
        if (r?.status === 401 && !trocouToken) {
          trocouToken = true;
          token = await tokenParaRepetir(token);
        } else if (r?.status === 429 && limites < ESPERAS_LIMITE.length && periodoDoLimite(r.corpo) === "segundo") {
          await recuar(ESPERAS_LIMITE[limites], caminho);
          limites += 1;
        } else if ((r === null || r.status >= 500) && falhas < ESPERAS_TRANSITORIO.length) {
          await recuar(ESPERAS_TRANSITORIO[falhas], caminho);
          falhas += 1;
        } else {
          throw erroFinal(r, caminho);
        }
      }
    },
  };
}

/**
 * Corpo lido aos pedaços; null = passou de `teto` bytes (a leitura para ali). `res.text()`
 * só deixaria medir depois de ter tudo na memória.
 */
export async function lerTextoComTeto(res: Response, teto: number): Promise<string | null> {
  if (res.body === null) return "";
  const leitor = res.body.getReader();
  const decodificador = new TextDecoder();
  let lidos = 0;
  let texto = "";
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) return texto + decodificador.decode();
    lidos += value.byteLength;
    if (lidos > teto) {
      // Falha ao cancelar não muda nada: o corpo já foi recusado.
      await leitor.cancel().catch(() => undefined);
      return null;
    }
    texto += decodificador.decode(value, { stream: true });
  }
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

/** Sem `period` legível vale o do segundo: as novas tentativas resolvem ou viram `limite` do mesmo jeito. */
function periodoDoLimite(corpo: string): PeriodoLimite {
  const erro = erroDaApi.safeParse(jsonOuNull(corpo));
  return erro.success && erro.data.error.period?.toLowerCase() === "day" ? "dia" : "segundo";
}

function erroFinal(r: Resposta | null, caminho: string): ErroBling {
  if (r === null) return new ErroBling("transitorio", null, `Bling: sem resposta em ${caminho} (rede ou tempo esgotado)`);
  const { status } = r;
  if (status === 401) return new ErroBling("auth", status, `Bling recusou o token em ${caminho} mesmo depois de renovar`);
  if (status === 429) {
    const periodo = periodoDoLimite(r.corpo);
    const cota = periodo === "dia" ? "cota do dia" : "limite de requisições";
    return new ErroBling("limite", status, `Bling: ${cota} atingido em ${caminho}`, periodo);
  }
  if (status >= 500) return new ErroBling("transitorio", status, `Bling: HTTP ${status} em ${caminho}`);
  // Falta de escopo vem com o erro do Bling; HTML de WAF ou de IP bloqueado (300 erros em 10 s) passa sozinho.
  if (status === 403 && !erroDaApi.safeParse(jsonOuNull(r.corpo)).success) {
    return new ErroBling("transitorio", status, `Bling: HTTP 403 sem erro do Bling em ${caminho} (bloqueio ou firewall)`);
  }
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
