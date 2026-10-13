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

/** GET /pedidos/vendas. Item sem id, situação ou total sai da lista; o resto da página segue. */
export async function listarPedidos(c: ClienteBling, f: FiltroPedidos): Promise<PedidoResumo[]> {
  const caminho = "/pedidos/vendas";
  const resposta = await c.get(caminho, {
    pagina: f.pagina,
    limite: f.limite ?? LIMITE_PADRAO,
    dataInicial: f.dataInicial,
    dataFinal: f.dataFinal,
    dataAlteracaoInicial: f.dataAlteracaoInicial,
    dataAlteracaoFinal: f.dataAlteracaoFinal,
  });
  const itens = listaDaResposta(resposta, caminho);
  const pedidos = itens.flatMap((item) => pedidoDe(item) ?? []);
  if (pedidos.length < itens.length) {
    // Só a contagem: o item pode ter nome e documento da cliente.
    console.warn(`[bling/api] ${itens.length - pedidos.length} pedido(s) da página ${f.pagina} sem id, situação ou total válido`);
  }
  return pedidos;
}

/** GET /pedidos/vendas/{id}. 404 → null (apagado no Bling). Pedido sem id, situação ou total → invalido. */
export async function obterPedido(c: ClienteBling, id: number): Promise<PedidoResumo | null> {
  const caminho = `/pedidos/vendas/${id}`;
  const achado = await buscarOuNada(c, caminho);
  if (!achado) return null;
  const pedido = pedidoDe(dataDaResposta(achado.resposta, caminho));
  if (!pedido) throw invalido(caminho);
  return pedido;
}

/** GET /contatos/{id}. 404 → null (contato apagado: o pedido segue sem dados da cliente). */
export async function obterContato(c: ClienteBling, id: number): Promise<ContatoBling | null> {
  const caminho = `/contatos/${id}`;
  const achado = await buscarOuNada(c, caminho);
  if (!achado) return null;
  const cru = contatoCru.safeParse(dataDaResposta(achado.resposta, caminho));
  if (!cru.success) throw invalido(caminho);
  const { endereco, dadosAdicionais, pais } = cru.data;
  return {
    // O id é o que pedimos; o do corpo só confirma.
    id: idPositivo(cru.data.id) ?? id,
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
    dataNascimento: dia(dadosAdicionais?.dataNascimento),
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

function pedidoDe(item: unknown): PedidoResumo | null {
  const cru = pedidoCru.safeParse(item);
  if (!cru.success) return null;
  const id = idPositivo(cru.data.id);
  const situacaoId = idPositivo(cru.data.situacao?.id);
  const total = valor(cru.data.total);
  if (id === null || situacaoId === null || total === null) return null;
  return { id, numero: texto(cru.data.numero), data: dia(cru.data.data), total, contatoId: idPositivo(cru.data.contato?.id), situacaoId };
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

/** "YYYY-MM-DD" que existe no calendário ("0000-00-00" e "2026-02-30" não); hora no fim é ignorada. */
function dia(v: Escalar): string | null {
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/.exec(v.trim()) : null;
  if (!m) return null;
  const [, ano, mes, d] = m;
  const iso = `${ano}-${mes}-${d}`;
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(d))).toISOString().slice(0, 10) === iso ? iso : null;
}

function umDe<T extends string>(v: string | undefined, opcoes: readonly T[]): T | null {
  return opcoes.find((o) => o === v) ?? null;
}
