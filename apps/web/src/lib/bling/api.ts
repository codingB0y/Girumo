import { z } from "zod";

import { dayBR, horaSegundoBR } from "@/lib/date-br";

import { ErroBling, type ClienteBling } from "./cliente";
import type { ContatoBling, EmpresaBling, PedidoResumo, SituacaoBling } from "./tipos";

export type { ContatoBling, EmpresaBling, PedidoResumo, SituacaoBling } from "./tipos";

/**
 * Os endpoints do Bling que a integração lê, já normalizados para os tipos de `tipos.ts`.
 *
 * O Bling muda formato sem avisar (número que vira texto, data "0000-00-00", campo que
 * some), e um item torto não pode derrubar a página inteira da varredura. Por isso todo
 * campo tem `.catch(null)`: o que não serve vira `null`. Só o que identifica o pedido (id,
 * situação, total) tira o item da lista. Objetos `looseObject`: campo novo do Bling passa.
 */

export type FiltroPedidos = {
  pagina: number;
  limite?: number;
  dataInicial?: string;
  dataFinal?: string;
  dataAlteracaoInicial?: string;
  dataAlteracaoFinal?: string;
};

/** O padrão do próprio Bling; maior que isso ele recusa. */
const LIMITE_PADRAO = 100;
/** Pedido de antes de 2000 é data torta ("0001-01-01", a época Unix): vira sem data. */
const ANO_MINIMO_PEDIDO = 2000;
/** O mesmo piso de `dados-do-cliente`: antes de 1900 não é nascimento de cliente. */
const ANO_MINIMO_NASCIMENTO = 1900;

/** Texto ou número; qualquer outra coisa vira null em vez de derrubar o objeto. */
const escalar = z.union([z.string(), z.number()]).nullish().catch(null);
const referencia = z.looseObject({ id: escalar }).nullish().catch(null);

const pedidoCru = z.looseObject({
  id: escalar,
  numero: escalar,
  data: escalar,
  total: escalar,
  contato: referencia,
  situacao: referencia,
  loja: referencia,
});

const contatoCru = z.looseObject({
  id: escalar,
  nome: escalar,
  tipo: escalar,
  celular: escalar,
  telefone: escalar,
  email: escalar,
  emailNotaFiscal: escalar,
  endereco: z
    .looseObject({ geral: z.looseObject({ municipio: escalar, uf: escalar, cep: escalar }).nullish().catch(null) })
    .nullish()
    .catch(null),
  dadosAdicionais: z.looseObject({ dataNascimento: escalar, sexo: escalar }).nullish().catch(null),
  pais: z.looseObject({ nome: escalar }).nullish().catch(null),
});

/** `id` da empresa só em texto: é o `companyId` que o aviso traz, comparado como texto. */
const empresaCru = z.looseObject({ id: z.string().nullish().catch(null), nome: escalar, razaoSocial: escalar, fantasia: escalar });
const moduloCru = z.looseObject({ id: escalar, nome: escalar });
const situacaoCru = z.looseObject({ id: escalar, nome: escalar, idHerdado: escalar });

/** GET /empresas/me/dados-basicos. O `id` é o `companyId` dos avisos: sem ele não há conexão. */
export async function obterEmpresa(c: ClienteBling): Promise<EmpresaBling> {
  const caminho = "/empresas/me/dados-basicos";
  const cru = empresaCru.safeParse(dataDaResposta(await c.get(caminho), caminho));
  const id = cru.success ? texto(cru.data.id) : null;
  if (!cru.success || id === null) throw invalido(caminho);
  // O nome não tem campo documentado com certeza: tenta os três.
  return { id, nome: texto(cru.data.nome) ?? texto(cru.data.razaoSocial) ?? texto(cru.data.fantasia) };
}

/**
 * Situações do módulo de vendas da conta (as próprias herdam de uma padrão pelo `idHerdado`).
 * null = módulo não achado OU sem nenhuma situação válida: quem chama cai no padrão.
 */
export async function listarSituacoesDeVenda(c: ClienteBling): Promise<SituacaoBling[] | null> {
  const modulos = listaDaResposta(await c.get("/situacoes/modulos"), "/situacoes/modulos").flatMap(moduloDe);
  const vendas = moduloDeVendas(modulos);
  if (!vendas) return null;
  const caminho = `/situacoes/modulos/${vendas.id}`;
  const situacoes = listaDaResposta(await c.get(caminho), caminho).flatMap(situacaoDe);
  return situacoes.length > 0 ? situacoes : null;
}

/**
 * Uma página da lista. `brutos` = itens que ela trouxe antes do descarte: só `brutos === 0` prova
 * que as páginas acabaram. `descartados` = o id de cada item torto que tem id legível.
 */
export type PaginaDePedidos = { pedidos: PedidoResumo[]; brutos: number; descartados: number[] };

/**
 * GET /pedidos/vendas. Item sem id, situação ou total sai da lista; o resto da página segue. O id do
 * torto volta em `descartados`: o motor o põe na fila pelo aviso, que busca o pedido inteiro. `prazo`
 * vai ao cliente (o da página da varredura, menor que o da execução).
 */
export async function listarPedidos(c: ClienteBling, f: FiltroPedidos, prazo?: number): Promise<PaginaDePedidos> {
  const caminho = "/pedidos/vendas";
  const query = {
    pagina: f.pagina,
    limite: f.limite ?? LIMITE_PADRAO,
    dataInicial: f.dataInicial,
    dataFinal: f.dataFinal,
    dataAlteracaoInicial: f.dataAlteracaoInicial,
    dataAlteracaoFinal: f.dataAlteracaoFinal,
  };
  const resposta = await c.get(caminho, query, prazo);
  const lidos = listaDaResposta(resposta, caminho).map((item) => ({ item, pedido: pedidoDe(item) }));
  // O descarte não passa calado: quem chama compara `brutos` com `pedidos` e loga, com a loja.
  return {
    pedidos: lidos.flatMap((l) => l.pedido ?? []),
    brutos: lidos.length,
    descartados: lidos.flatMap((l) => (l.pedido ? [] : (idDoItem(l.item) ?? []))),
  };
}

/**
 * GET /pedidos/vendas/{id}. 404 → null (apagado no Bling). Sem situação ou total, ou com o id
 * de outro pedido no corpo → invalido. O id devolvido é sempre o pedido.
 */
export async function obterPedido(c: ClienteBling, id: number): Promise<PedidoResumo | null> {
  const caminho = `/pedidos/vendas/${id}`;
  const achado = await buscarOuNada(c, caminho);
  if (!achado) return null;
  const pedido = pedidoDe(dataDaResposta(achado.resposta, caminho), id);
  if (!pedido) throw invalido(caminho);
  return pedido;
}

/** GET /contatos/{id}. 404 → null (contato apagado: o pedido segue sem dados da cliente). Id de outro contato → invalido. */
export async function obterContato(c: ClienteBling, id: number): Promise<ContatoBling | null> {
  const caminho = `/contatos/${id}`;
  const achado = await buscarOuNada(c, caminho);
  if (!achado) return null;
  const cru = contatoCru.safeParse(dataDaResposta(achado.resposta, caminho));
  if (!cru.success || !idConfere(cru.data.id, id)) throw invalido(caminho);
  const { endereco, dadosAdicionais, pais } = cru.data;
  return {
    id,
    nome: texto(cru.data.nome),
    tipo: umDe(texto(cru.data.tipo)?.toUpperCase(), ["F", "J", "E"] as const),
    celular: texto(cru.data.celular),
    telefone: texto(cru.data.telefone),
    email: texto(cru.data.email),
    emailNotaFiscal: texto(cru.data.emailNotaFiscal),
    municipio: texto(endereco?.geral?.municipio),
    uf: texto(endereco?.geral?.uf),
    cep: texto(endereco?.geral?.cep),
    pais: texto(pais?.nome),
    dataNascimento: dia(dadosAdicionais?.dataNascimento, ANO_MINIMO_NASCIMENTO),
    sexo: umDe(texto(dadosAdicionais?.sexo)?.toUpperCase(), ["M", "F"] as const),
  };
}

/** "YYYY-MM-DD HH:MM:SS" em America/Sao_Paulo (formato dos filtros dataAlteracao*). */
export function horaDoBling(d: Date): string {
  return `${dayBR(d)} ${horaSegundoBR(d.toISOString())}`;
}

/** "YYYY-MM-DD" em America/Sao_Paulo. */
export function diaDoBling(d: Date): string {
  return dayBR(d);
}

/** 404 é resposta, não falha: o pedido ou o contato foi apagado no Bling. */
async function buscarOuNada(c: ClienteBling, caminho: string): Promise<{ resposta: unknown } | null> {
  try {
    return { resposta: await c.get(caminho) };
  } catch (e) {
    if (e instanceof ErroBling && e.tipo === "nao_encontrado") return null;
    throw e;
  }
}

/** Toda resposta vem em `{ data: … }`; fora disso não dá para confiar em nada. */
function dataDaResposta(resposta: unknown, caminho: string): unknown {
  if (typeof resposta !== "object" || resposta === null || !("data" in resposta)) throw invalido(caminho);
  return resposta.data;
}

function listaDaResposta(resposta: unknown, caminho: string): unknown[] {
  const data = dataDaResposta(resposta, caminho);
  if (!Array.isArray(data)) throw invalido(caminho);
  return data;
}

function invalido(caminho: string): ErroBling {
  return new ErroBling("invalido", null, `Bling: resposta inesperada de ${caminho}`);
}

/** Na lista o id vem do item; no detalhe é o `pedido` feito, e o do corpo (se veio) tem de bater. */
function pedidoDe(item: unknown, pedido?: number): PedidoResumo | null {
  const cru = pedidoCru.safeParse(item);
  if (!cru.success) return null;
  if (pedido !== undefined && !idConfere(cru.data.id, pedido)) return null;
  const id = pedido ?? idPositivo(cru.data.id);
  const situacaoId = idPositivo(cru.data.situacao?.id);
  const total = valor(cru.data.total);
  if (id === null || situacaoId === null || total === null) return null;
  const data = dia(cru.data.data, ANO_MINIMO_PEDIDO);
  const resumo = { id, numero: texto(cru.data.numero), data, total, contatoId: idPositivo(cru.data.contato?.id), situacaoId };
  const lojaId = canalDe(cru.data.loja?.id);
  // "Não se sabe" fica fora do objeto: o retrato no jsonb também não guarda a chave.
  return lojaId === undefined ? resumo : { ...resumo, lojaId };
}

/** 0 = lançado direto no Bling (null). Sem loja ou com id torto não se sabe (undefined): não vira "sem canal". */
function canalDe(id: Escalar): number | null | undefined {
  if (id === 0 || id === "0") return null;
  return idPositivo(id) ?? undefined;
}

/** O id do item da lista, quando legível (inteiro positivo, em número ou texto de dígitos). */
function idDoItem(item: unknown): number | null {
  const cru = pedidoCru.safeParse(item);
  return cru.success ? idPositivo(cru.data.id) : null;
}

/** Corpo com o id de OUTRO recurso é resposta trocada: gravar seria dar o estado de um ao outro. Sem id, confia no pedido. */
function idConfere(doCorpo: Escalar, pedido: number): boolean {
  const id = idPositivo(doCorpo);
  return id === null || id === pedido;
}

type Modulo = { id: number; nome: string };

function moduloDe(item: unknown): Modulo[] {
  const m = moduloCru.safeParse(item);
  const id = m.success ? idPositivo(m.data.id) : null;
  return m.success && id !== null ? [{ id, nome: nomeComparavel(texto(m.data.nome) ?? "") }] : [];
}

function situacaoDe(item: unknown): SituacaoBling[] {
  const s = situacaoCru.safeParse(item);
  const id = s.success ? idPositivo(s.data.id) : null;
  if (!s.success || id === null) return [];
  return [{ id, nome: texto(s.data.nome) ?? `Situação ${id}`, base: idPositivo(s.data.idHerdado) ?? id }];
}

const NOMES_DO_MODULO_DE_VENDAS = ["vendas", "pedidos de venda", "pedidos de vendas"];
/** Também têm "venda" no nome e não são pedido de venda. */
const NAO_SAO_VENDAS = ["pdv", "proposta", "devolu"];

/** O nome exato vence; senão o primeiro que fala de venda e não é PDV, proposta nem devolução. */
function moduloDeVendas(modulos: readonly Modulo[]): Modulo | undefined {
  return (
    modulos.find((m) => NOMES_DO_MODULO_DE_VENDAS.includes(m.nome)) ??
    modulos.find((m) => m.nome.includes("venda") && !NAO_SAO_VENDAS.some((x) => m.nome.includes(x)))
  );
}

function nomeComparavel(nome: string): string {
  return nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

type Escalar = string | number | null | undefined;

/** Vazio (ou só espaço) vira null; número vira texto. */
function texto(v: Escalar): string | null {
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  const t = v?.trim() ?? "";
  return t === "" ? null : t;
}

/** Inteiro positivo, em número ou em texto de dígitos. O Bling usa 0 para "nenhum". */
function idPositivo(v: Escalar): number | null {
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Valor em número ou em texto com ponto decimal ("150.50"). Texto vazio NÃO é zero. */
function valor(v: Escalar): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = v?.trim() ?? "";
  return /^-?\d+(?:\.\d+)?$/.test(t) ? Number(t) : null;
}

/** "YYYY-MM-DD" que existe no calendário ("0000-00-00" e "2026-02-30" não), de `anoMinimo` em diante; hora no fim é ignorada. */
function dia(v: Escalar, anoMinimo: number): string | null {
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/.exec(v.trim()) : null;
  if (!m || Number(m[1]) < anoMinimo) return null;
  const [, ano, mes, d] = m;
  const iso = `${ano}-${mes}-${d}`;
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(d))).toISOString().slice(0, 10) === iso ? iso : null;
}

function umDe<T extends string>(v: string | undefined, opcoes: readonly T[]): T | null {
  return opcoes.find((o) => o === v) ?? null;
}
