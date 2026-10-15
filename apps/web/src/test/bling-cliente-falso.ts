/**
 * O mundo falso do cliente HTTP do Bling (`lib/bling/cliente.ts`), para os testes dele
 * (`cliente*.test.ts`): o fetch que responde de uma fila, o relógio que só anda quando alguém
 * espera, e os formatos de erro do Bling.
 */
import { criarClienteBling, ErroBling, type OpcoesCliente, type TipoErroBling } from "@/lib/bling/cliente";

export type Chamada = { url: string; headers: Record<string, string>; signal: unknown; redirect: unknown; em: number };
export type Extra = Partial<OpcoesCliente> & { congelado?: boolean; duracaoFetch?: number };

/**
 * Relógio e fetch falsos. `esperar` avança o relógio na hora (ninguém dorme de verdade);
 * com `congelado`, só registra a espera — é o que mostra as vezes reservadas em paralelo.
 * `duracaoFetch` = quanto cada chamada leva no relógio falso.
 */
export function montar(respostas: Array<Response | Error>, extra: Extra = {}) {
  let t = 0;
  const esperas: number[] = [];
  const chamadas: Chamada[] = [];
  const tokens: string[] = [];
  let renovacoes = 0;
  const { congelado, duracaoFetch = 0, ...opcoes } = extra;
  const fetchImpl = (async (entrada: string | URL | Request, init?: RequestInit) => {
    chamadas.push({
      url: String(entrada),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      signal: init?.signal,
      redirect: init?.redirect,
      em: t,
    });
    t += duracaoFetch;
    const r = respostas.shift();
    if (r === undefined) throw new Error("fetch falso: acabaram as respostas");
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  const cliente = criarClienteBling({
    token: async () => {
      tokens.push("tok-1");
      return "tok-1";
    },
    renovar: async () => {
      renovacoes += 1;
      return `tok-renovado-${renovacoes}`;
    },
    fetchImpl,
    agora: () => t,
    esperar: async (ms) => {
      esperas.push(ms);
      if (!congelado) t += ms;
    },
    ...opcoes,
  });
  return { cliente, esperas, chamadas, tokens, renovacoes: () => renovacoes };
}

export function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

/** `periodo` só existe no `limite`: os outros tipos têm de vir com null. Prazo esgotado só em `porPrazo`. */
export function erroBling(tipo: TipoErroBling, status: number | null, periodo: "segundo" | "dia" | null = null) {
  return (e: unknown) =>
    e instanceof ErroBling && e.tipo === tipo && e.status === status && e.periodo === periodo && !e.prazoEsgotado;
}

/** O motor decide pelo campo, não pela mensagem: é o orçamento acabando, não o Bling. */
export const porPrazo = (e: unknown) => e instanceof ErroBling && e.tipo === "transitorio" && e.status === null && e.prazoEsgotado;

export const limiteDoSegundo = () =>
  json(429, { error: { type: "TOO_MANY_REQUESTS", message: "Limite de requisições atingido.", limit: 3, period: "second" } });
export const limiteDoDia = () =>
  json(429, { error: { type: "TOO_MANY_REQUESTS", message: "Limite de requisições atingido.", limit: 120000, period: "day" } });

/** Corpo de `megas` pedaços de 1 MB gerados sob demanda: mostra quanto foi lido e se a leitura parou. */
export function corpoGrande(status: number, megas: number) {
  const pedaco = new Uint8Array(1024 * 1024).fill(0x61);
  let lidos = 0;
  let cancelado = false;
  const corpo = new ReadableStream<Uint8Array>({
    pull(controle) {
      if (lidos === megas) {
        controle.close();
        return;
      }
      lidos += 1;
      controle.enqueue(pedaco);
    },
    cancel() {
      cancelado = true;
    },
  });
  return { resposta: new Response(corpo, { status }), lidos: () => lidos, cancelado: () => cancelado };
}

/** Deixa o resto do programa andar (fetch falso, leitura do corpo) até `pronto` valer. */
export async function ate(pronto: () => boolean) {
  for (let i = 0; i < 1000 && !pronto(); i += 1) await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}
