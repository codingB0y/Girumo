/**
 * O Bling falso (ver `bling-falso.ts`): um `fetch` roteado pela URL. Confere o Bearer (token
 * renovado mata o velho, como o refresh que rotaciona), serve pedidos, contatos e situações no
 * formato da API v3, e aceita respostas forçadas por caminho (401, 403, 429, 5xx, com efeito).
 */
import type { ContatoBling, PedidoResumo } from "@/lib/bling/tipos";

import { json, pedidoDoBling, type BlingRemoto, type Estado } from "./bling-falso-base";

/** "YYYY-MM-DD HH:MM:SS" de São Paulo (UTC−3, sem horário de verão desde 2019), como o filtro do Bling, em epoch ms. */
function instanteDoBling(texto: string | null): number {
  return Date.parse(`${(texto ?? "").replace(" ", "T")}-03:00`);
}

/**
 * GET /pedidos/vendas por data de alteração, como o Bling: os pedidos alterados dentro do filtro, em
 * ordem de id, cortados por posição (`pagina`/`limite`). O teste muda o mapa entre leituras e a lista
 * anda como a de verdade: quem é alterado de novo sai da janela e puxa os seguintes para trás.
 */
export function listaPorAlteracao(alteradoEm: ReadonlyMap<number, number>): (q: URLSearchParams) => PedidoResumo[] {
  return (q) => {
    if (!q.has("dataAlteracaoInicial")) return [];
    const de = instanteDoBling(q.get("dataAlteracaoInicial"));
    const ate = instanteDoBling(q.get("dataAlteracaoFinal"));
    const [pagina, limite] = [Number(q.get("pagina")), Number(q.get("limite"))];
    const ids = [...alteradoEm].filter(([, t]) => t >= de && t <= ate).map(([id]) => id);
    return ids.sort((a, b) => a - b).slice((pagina - 1) * limite, pagina * limite).map((id) => pedidoDoBling(id));
  };
}

/** `quantos` pedidos (ids a partir de `primeiro`), alterados de `inicio` em diante, um a cada `passo` ms (o mapa de `listaPorAlteracao`). */
export function alterados(primeiro: number, quantos: number, inicio: number, passo: number): Map<number, number> {
  return new Map(Array.from({ length: quantos }, (_, i) => [primeiro + i, inicio + i * passo] as const));
}

export function fetchDoBling(e: Estado): typeof fetch {
  return (async (entrada: string | URL | Request, init?: RequestInit) => {
    const b = e.bling;
    const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    const caminho = url.pathname.replace(/^\/Api\/v3/, "");
    const autorizacao = new Headers(init?.headers).get("authorization") ?? "";
    const token = autorizacao.startsWith("Bearer ") ? autorizacao.slice("Bearer ".length) : null;
    b.chamadas.push({ metodo: init?.method ?? "GET", caminho, query: url.searchParams, token });
    const forcada = b.forcadas.find((r) => r.vezes > 0 && r.caminho.test(caminho));
    if (forcada) {
      forcada.vezes -= 1;
      return forcada.resposta();
    }
    if (caminho === "/oauth/token") return renovacao(b, String(init?.body ?? ""));
    if (b.recusaTudo || !token || !b.aceitos.has(token)) return json(401, { error: { type: "invalid_token", message: "Token inválido" } });
    return rotaDaApi(b, caminho, url.searchParams);
  }) as typeof fetch;
}

/** O refresh rotaciona: o usado morre, e o access velho deixa de valer (o teste vê qual token foi usado). */
function renovacao(b: BlingRemoto, corpo: string): Response {
  if (b.oauth) return b.oauth();
  if (new URLSearchParams(corpo).get("refresh_token") !== b.refreshValido) return json(400, { error: "invalid_grant" });
  b.emitidos += 1;
  const access = `access-novo-${b.emitidos}`;
  b.aceitos = new Set([access]);
  b.refreshValido = `refresh-novo-${b.emitidos}`;
  return json(200, { access_token: access, refresh_token: b.refreshValido, expires_in: 21_600 });
}

const NAO_ACHOU = (): Response => json(404, { error: { type: "RESOURCE_NOT_FOUND", message: "Não encontrado" } });

function pedidoNoFormatoDoBling(p: PedidoResumo) {
  return {
    id: p.id,
    numero: p.numero,
    data: p.data,
    total: p.total,
    contato: { id: p.contatoId ?? 0 },
    situacao: { id: p.situacaoId, valor: 0 },
    loja: { id: p.lojaId ?? 0 },
  };
}

function contatoNoFormatoDoBling(c: ContatoBling) {
  return {
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    celular: c.celular,
    telefone: c.telefone,
    email: c.email,
    emailNotaFiscal: c.emailNotaFiscal,
    endereco: { geral: { municipio: c.municipio, uf: c.uf, cep: c.cep } },
    dadosAdicionais: { dataNascimento: c.dataNascimento, sexo: c.sexo },
    pais: { nome: c.pais },
  };
}

/** Todos na página 1; sem o escopo, o 403 com o erro do Bling (o cliente o lê como `escopo`). */
function canaisDaConta(b: BlingRemoto, query: URLSearchParams): Response {
  if (b.canais === null) return json(403, { error: { type: "FORBIDDEN", message: "Sem permissão", description: "escopo" } });
  const pagina = query.get("pagina") === "1" ? b.canais : [];
  return json(200, { data: pagina.map((c) => ({ id: c.id, descricao: c.nome, tipo: c.tipo, situacao: c.ativo ? 1 : 2 })) });
}

function rotaDaApi(b: BlingRemoto, caminho: string, query: URLSearchParams): Response {
  if (caminho === "/pedidos/vendas") return json(200, { data: b.paginas(query).map(pedidoNoFormatoDoBling) });
  const pedido = /^\/pedidos\/vendas\/(\d+)$/.exec(caminho);
  if (pedido) {
    const p = b.pedidos.get(Number(pedido[1]));
    return p ? json(200, { data: pedidoNoFormatoDoBling(p) }) : NAO_ACHOU();
  }
  const contato = /^\/contatos\/(\d+)$/.exec(caminho);
  if (contato) {
    const c = b.contatos.get(Number(contato[1]));
    return c ? json(200, { data: contatoNoFormatoDoBling(c) }) : NAO_ACHOU();
  }
  if (caminho === "/canais-venda") return canaisDaConta(b, query);
  if (caminho === "/situacoes/modulos") return json(200, { data: [{ id: 98310, nome: "Vendas" }] });
  if (caminho === "/situacoes/modulos/98310") {
    return json(200, { data: b.situacoes.map((s) => ({ id: s.id, nome: s.nome, idHerdado: s.base === s.id ? 0 : s.base })) });
  }
  return NAO_ACHOU();
}
