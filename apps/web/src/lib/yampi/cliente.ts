import { lerTextoComTeto, TETO_RESPOSTA_BYTES } from "@/lib/bling/cliente";

import { lerAlias } from "./credenciais";

/**
 * Cliente HTTP da API da Yampi (`https://api.dooki.com.br/v2/{alias}`), um por chamada de módulo.
 *
 * O limite (~60 req/min por rota) é do IP de saída, dividido entre todas as lojas. A doc promete
 * `X-RateLimit-Remaining` e `Retry-After`; a Fase 0 não viu nenhum dos dois (Y16), então quem segura de verdade é o
 * 429 e o teto por loja do cartão. `Remaining` ≤ 0 adia a próxima chamada desta loja até o fim da janela; 429 espera
 * o `Retry-After` (até 10 s) e repete uma vez. 5xx e rede tentam mais 2 vezes (1 s e 3 s); 4xx não repete.
 *
 * Mensagem de erro fixa, sem a consulta: o erro do `fetch` cita o valor do cabeçalho (o token), e o corpo da
 * resposta pode trazer dado da cliente.
 *
 * Sem `server-only`: fetch, relógio e espera chegam injetados.
 */

export const YAMPI_API_BASE = "https://api.dooki.com.br/v2";

const TIMEOUT_MS = 10_000;
const ESPERA_MAXIMA_MS = 10_000;
const RETRY_AFTER_PADRAO_MS = 2_000;
const JANELA_DO_LIMITE_MS = 60_000;
const ESPERAS_TRANSITORIO = [1_000, 3_000];

export class YampiErro extends Error {
  /** 0 = sem resposta. */
  readonly status: number;
  readonly retryAfterMs: number | null;
  constructor(status: number, mensagem: string, retryAfterMs: number | null = null) {
    super(mensagem);
    this.name = "YampiErro";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export type Query = Record<string, string | number>;

export type ClienteYampi = {
  get<T>(caminho: string, query?: Query): Promise<T>;
  post<T>(caminho: string, corpo: unknown): Promise<T>;
  apagar(caminho: string): Promise<void>;
};

export type OpcoesClienteYampi = {
  alias: string;
  token: string;
  secretKey: string;
  fetchImpl?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  agora?: () => number;
  /** alias → epoch ms até quando não chamar; padrão: o mapa do módulo. */
  bloqueios?: Map<string, number>;
};

// ponytail: a contagem é por instância; quem decide é o servidor, pelo cabeçalho
const BLOQUEIOS_DO_MODULO = new Map<string, number>();

const esperarDeVerdade = (ms: number) => new Promise<void>((pronto) => setTimeout(pronto, ms));

/** `Retry-After` em segundos ou em data HTTP; ausente ou torto = null. */
function retryAfterMs(res: Response, agora: number): number | null {
  const valor = res.headers.get("retry-after")?.trim();
  if (!valor) return null;
  const segundos = Number(valor);
  if (Number.isFinite(segundos) && segundos >= 0) return segundos * 1000;
  const data = Date.parse(valor);
  return Number.isNaN(data) ? null : Math.max(0, data - agora);
}

export function criarClienteYampi(o: OpcoesClienteYampi): ClienteYampi {
  const lido = lerAlias(o.alias);
  if (!lido) throw new YampiErro(0, "Yampi: alias inválido");
  const alias: string = lido;
  const agora = o.agora ?? Date.now;
  const esperar = o.esperar ?? esperarDeVerdade;
  const bloqueios = o.bloqueios ?? BLOQUEIOS_DO_MODULO;

  async function respeitarBloqueio(caminho: string): Promise<void> {
    const falta = (bloqueios.get(alias) ?? 0) - agora();
    if (falta <= 0) return;
    if (falta > ESPERA_MAXIMA_MS) throw new YampiErro(429, `Yampi: limite em ${caminho}`, falta);
    await esperar(falta);
  }

  function bloquear(ms: number): void {
    bloqueios.set(alias, agora() + ms);
  }

  async function chamar(metodo: "GET" | "POST" | "DELETE", caminhoComConsulta: string, query?: Query, corpo?: unknown): Promise<unknown> {
    const caminho = caminhoComConsulta.split("?")[0];
    const consulta = query ? `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}` : "";
    const url = `${YAMPI_API_BASE}/${alias}${caminhoComConsulta}${consulta}`;
    const cabecalhos: Record<string, string> = { "User-Token": o.token, "User-Secret-Key": o.secretKey, Accept: "application/json" };
    if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
    const esperasTransitorio = [...ESPERAS_TRANSITORIO];
    let repetiuLimite = false;

    for (;;) {
      await respeitarBloqueio(caminho);
      let res: Response;
      try {
        res = await (o.fetchImpl ?? fetch)(url, {
          method: metodo,
          headers: cabecalhos,
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
          redirect: "error",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        const espera = esperasTransitorio.shift();
        if (espera === undefined) throw new YampiErro(0, `Yampi: sem resposta em ${caminho}`);
        await esperar(espera);
        continue;
      }

      const retry = retryAfterMs(res, agora());
      const restante = res.headers.get("x-ratelimit-remaining");
      if (restante !== null && Number(restante) <= 0) bloquear(retry ?? JANELA_DO_LIMITE_MS);

      if (res.status === 429) {
        const espera = retry ?? RETRY_AFTER_PADRAO_MS;
        bloquear(espera);
        if (espera > ESPERA_MAXIMA_MS || repetiuLimite) throw new YampiErro(429, `Yampi: HTTP 429 em ${caminho}`, espera);
        repetiuLimite = true;
        continue; // a espera é a do bloqueio, no início da volta
      }
      if (res.status >= 500) {
        const espera = esperasTransitorio.shift();
        if (espera === undefined) throw new YampiErro(res.status, `Yampi: HTTP ${res.status} em ${caminho}`);
        await esperar(espera);
        continue;
      }
      if (!res.ok) throw new YampiErro(res.status, `Yampi: HTTP ${res.status} em ${caminho}`);
      if (metodo === "DELETE" || res.status === 204) {
        await res.body?.cancel().catch(() => undefined);
        return undefined;
      }
      const texto = await lerTextoComTeto(res, TETO_RESPOSTA_BYTES);
      if (texto === null) throw new YampiErro(502, `Yampi: resposta grande demais em ${caminho}`);
      try {
        return JSON.parse(texto);
      } catch {
        throw new YampiErro(502, `Yampi: resposta que não é JSON em ${caminho}`);
      }
    }
  }

  return {
    get: async <T>(caminho: string, query?: Query) => (await chamar("GET", caminho, query)) as T,
    post: async <T>(caminho: string, corpo: unknown) => (await chamar("POST", caminho, undefined, corpo)) as T,
    apagar: async (caminho: string) => {
      await chamar("DELETE", caminho);
    },
  };
}
