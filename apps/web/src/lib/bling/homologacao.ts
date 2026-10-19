import "server-only";

import { BLING_API_BASE } from "./cliente";

/**
 * O teste técnico da homologação do app no Bling (developer.bling.com.br/homologacao, seção "Execução"): cinco chamadas
 * seguidas em /homologacao/produtos — GET, POST com o que o GET trouxe, PUT trocando o nome para "Copo", PATCH da
 * situação e DELETE —, cada uma com o hash `x-bling-homologacao` da resposta anterior. Em até 10 s no total e 2 s entre
 * as chamadas. Num dos passos o Bling invalida o access token: renova (uma vez) e repete aquele passo, com o mesmo hash.
 * O produto é de mentira: nada é criado na conta.
 *
 * Fora do cliente da API de propósito: ele só faz GET, espaça as chamadas (3/s) e não devolve cabeçalho.
 */

export type EntradaHomologacao = {
  fetchImpl: typeof fetch;
  /** O access token da vez (muda depois de `renovar`). */
  token: () => string;
  /** Troca o par (o refresh rotaciona: quem chama grava o par novo). Lança se não der. */
  renovar: () => Promise<void>;
  agora: () => number;
};

export type NomeDoPasso = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type PassoHomologacao = { passo: NomeDoPasso; status: number | null; ms: number; renovou: boolean };
export type RelatorioHomologacao = { ok: boolean; passos: PassoHomologacao[]; totalMs: number; erro: string | null };

/** O teto do Bling para o teste inteiro. */
const TETO_DO_TESTE_MS = 10_000;
/** Uma chamada que passa disto já estourou os 2 s entre chamadas: não adianta esperar mais. */
const TIMEOUT_DA_CHAMADA_MS = 4_000;
const CAMINHO = "/homologacao/produtos";
const HASH = "x-bling-homologacao";
const TAMANHO_DA_MENSAGEM = 200;

type Passo = { nome: NomeDoPasso; caminho: string; corpo?: unknown };
type Resposta = { status: number; hash: string | null; data: unknown };

class FalhaDoPasso extends Error {}

export async function executarHomologacao(e: EntradaHomologacao): Promise<RelatorioHomologacao> {
  const inicio = e.agora();
  const passos: PassoHomologacao[] = [];
  let renovou = false;
  let hash: string | null = null;

  /** Uma chamada; o 401 renova uma vez por teste e repete o mesmo passo. */
  async function rodar(p: Passo, ultimo = false): Promise<Resposta> {
    const comeco = e.agora();
    let r = await chamar(e, p, hash);
    let renovouAqui = false;
    if (r.status === 401 && !renovou) {
      renovou = true;
      renovouAqui = true;
      await e.renovar();
      r = await chamar(e, p, hash);
    }
    passos.push({ passo: p.nome, status: r.status, ms: e.agora() - comeco, renovou: renovouAqui });
    if (r.status === 401) throw new FalhaDoPasso(`${p.nome}: HTTP 401 depois de renovar o acesso`);
    if (r.status < 200 || r.status >= 300) throw new FalhaDoPasso(`${p.nome}: HTTP ${r.status}${mensagemDoBling(r.data)}`);
    if (!ultimo && !r.hash) throw new FalhaDoPasso(`${p.nome}: resposta sem ${HASH}`);
    hash = r.hash;
    return r;
  }

  try {
    const produto = dadosDoProduto((await rodar({ nome: "GET", caminho: CAMINHO })).data, "GET");
    const criado = dadosDoProduto((await rodar({ nome: "POST", caminho: CAMINHO, corpo: produto })).data, "POST");
    const id = idDoProduto(criado);
    await rodar({ nome: "PUT", caminho: `${CAMINHO}/${id}`, corpo: { ...produto, nome: "Copo" } });
    await rodar({ nome: "PATCH", caminho: `${CAMINHO}/${id}/situacoes`, corpo: { situacao: "I" } });
    await rodar({ nome: "DELETE", caminho: `${CAMINHO}/${id}` }, true);
  } catch (erro) {
    return { ok: false, passos, totalMs: e.agora() - inicio, erro: mensagemDe(erro) };
  }
  const totalMs = e.agora() - inicio;
  if (totalMs > TETO_DO_TESTE_MS) {
    return { ok: false, passos, totalMs, erro: `O teste levou ${totalMs} ms: o Bling aceita até 10 s no total.` };
  }
  return { ok: true, passos, totalMs, erro: null };
}

async function chamar(e: EntradaHomologacao, p: Passo, hash: string | null): Promise<Resposta> {
  const headers: Record<string, string> = { authorization: `Bearer ${e.token()}`, accept: "application/json" };
  if (hash) headers[HASH] = hash;
  if (p.corpo !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await e.fetchImpl(`${BLING_API_BASE}${p.caminho}`, {
      method: p.nome,
      headers,
      body: p.corpo === undefined ? undefined : JSON.stringify(p.corpo),
      signal: AbortSignal.timeout(TIMEOUT_DA_CHAMADA_MS),
    });
  } catch (erro) {
    throw new FalhaDoPasso(`${p.nome}: ${mensagemDe(erro)}`);
  }
  const texto = await res.text().catch(() => "");
  return { status: res.status, hash: res.headers.get(HASH), data: lerJson(texto) };
}

function lerJson(texto: string): unknown {
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

/** O `data` da resposta, um objeto; senão o passo falha (o seguinte não teria o que mandar). */
function dadosDoProduto(corpo: unknown, passo: NomeDoPasso): Record<string, unknown> {
  const data = corpo !== null && typeof corpo === "object" && "data" in corpo ? corpo.data : null;
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new FalhaDoPasso(`${passo}: resposta sem o produto`);
  return data as Record<string, unknown>;
}

function idDoProduto(produto: Record<string, unknown>): string {
  const id = produto.id;
  if ((typeof id === "number" && Number.isSafeInteger(id) && id > 0) || (typeof id === "string" && /^\d+$/.test(id))) return String(id);
  throw new FalhaDoPasso("POST: resposta sem o id do produto");
}

/** A mensagem do erro do Bling, curta. Só texto do corpo de erro: nada de token (ele não volta no corpo). */
function mensagemDoBling(corpo: unknown): string {
  const erro = corpo !== null && typeof corpo === "object" && "error" in corpo ? corpo.error : null;
  if (erro === null || typeof erro !== "object") return "";
  const { message, description } = erro as { message?: unknown; description?: unknown };
  const texto = [message, description].filter((t): t is string => typeof t === "string" && t.trim() !== "").join(" — ");
  return texto ? ` — ${texto.slice(0, TAMANHO_DA_MENSAGEM)}` : "";
}

function mensagemDe(erro: unknown): string {
  return (erro instanceof Error ? erro.message : String(erro)).slice(0, TAMANHO_DA_MENSAGEM * 2);
}
