import "server-only";

import { z } from "zod";

import { lerTextoComTeto, TETO_RESPOSTA_BYTES } from "@/lib/bling/cliente";
import { dataDaYampi } from "@/lib/rastreio/pedido-yampi";
import type { EtiquetaMelhorEnvio } from "@/lib/rastreio/marcos";

import { tokenSeguro, USER_AGENT_ME, type OpcoesHttp } from "./oauth";

export const ME_API = "https://melhorenvio.com.br/api/v2/me";

const TIMEOUT_MS = 15_000;

/** Mensagem fixa: nunca o corpo, a URL com query ou o token. status 0 = sem resposta. */
export class ErroMelhorEnvio extends Error {
  readonly status: number;

  constructor(status: number) {
    super(status === 0 ? "o Melhor Envio não respondeu" : `o Melhor Envio respondeu ${status}`);
    this.name = "ErroMelhorEnvio";
    this.status = status;
  }
}

export type ContaMelhorEnvio = { nome: string; email: string };

const dadosDaConta = z.object({ firstname: z.string().optional(), lastname: z.string().optional(), email: z.string().min(1) });

export async function contaDoToken(token: string, opcoes: OpcoesHttp = {}): Promise<ContaMelhorEnvio> {
  const r = await pedir(ME_API, token, opcoes);
  const d = dadosDaConta.safeParse(r.json);
  if (!d.success) throw new ErroMelhorEnvio(r.status);
  const nome = [d.data.firstname, d.data.lastname].filter(Boolean).join(" ");
  return { nome, email: d.data.email };
}

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export async function paginaDeEtiquetas(
  token: string,
  pagina: number,
  opcoes: OpcoesHttp = {},
): Promise<{ etiquetas: EtiquetaMelhorEnvio[]; ultimaPagina: number }> {
  const r = await pedir(`${ME_API}/orders?page=${pagina}`, token, opcoes);
  if (r.status === 204) return { etiquetas: [], ultimaPagina: 0 };
  const corpo = r.json;
  if (!corpo || typeof corpo !== "object") throw new ErroMelhorEnvio(r.status);
  const { data, last_page } = corpo as { data?: unknown; last_page?: unknown };
  if (!Array.isArray(data)) throw new ErroMelhorEnvio(r.status);
  const etiquetas: EtiquetaMelhorEnvio[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const status = texto(o.status);
    if (!status) continue;
    etiquetas.push({
      tracking: texto(o.tracking),
      status,
      criadaEm: dataDaYampi(o.created_at),
      atualizadaEm: dataDaYampi(o.updated_at),
      entregueEm: dataDaYampi(o.delivered_at),
    });
  }
  const ultimaPagina = typeof last_page === "number" && Number.isInteger(last_page) && last_page > 0 ? last_page : 1;
  return { etiquetas, ultimaPagina };
}

/** GET autenticado. Lança ErroMelhorEnvio em tudo que não for 2xx com JSON inteiro (204 passa sem corpo). */
async function pedir(url: string, token: string, opcoes: OpcoesHttp): Promise<{ status: number; json: unknown }> {
  if (!tokenSeguro.safeParse(token).success) throw new ErroMelhorEnvio(0);
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  let status: number;
  let corpo: string | null;
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": USER_AGENT_ME },
      redirect: "error",
      signal: AbortSignal.timeout(opcoes.timeoutMs ?? TIMEOUT_MS),
    });
    status = res.status;
    // Não repassa o erro de fetch: a mensagem do undici pode citar valor de header.
    corpo = status === 204 ? "" : await lerTextoComTeto(res, TETO_RESPOSTA_BYTES);
  } catch {
    throw new ErroMelhorEnvio(0);
  }
  if (corpo === null) throw new ErroMelhorEnvio(0);
  if (status < 200 || status >= 300) throw new ErroMelhorEnvio(status);
  if (status === 204) return { status, json: null };
  try {
    return { status, json: JSON.parse(corpo) as unknown };
  } catch {
    throw new ErroMelhorEnvio(status);
  }
}
