import { dayBR, dayBRAgo, dayBROf, diaMesBR, horaBR } from "@/lib/date-br";
import { parseValorDoPedido } from "@/lib/orders/valor-do-pedido";
import { formatPhoneBR } from "@/lib/phone";
import type { ItemDeVenda, VendaDoMes } from "@/lib/vendas/tipos";

/**
 * Regras da tela de vendas (spec 2026-10-07 §4), fora do componente para teste.
 * Os limites repetem os do servidor (zod de `POST /api/vendas` e checks de
 * `order_items`): a tela recusa antes do clique o que a API recusaria depois.
 */
export const MAX_ITENS = 50;
export const MAX_NOME_DO_PRODUTO = 120;
const MAX_QUANTIDADE = 9999;
const MAX_VALOR = 999_999.99;
const MAX_TOTAL = 9_999_999_999.99; // numeric(12,2) da venda inteira

// As duas primeiras são as mesmas strings de `MESSAGES.items`/`MESSAGES.zeroTotal` da API (PR 4,
// `lib/vendas/` — rotas devolvem `{ error }` com elas): a tela não pode dizer uma coisa e a rota outra.
export const ERRO_LINHA_INCOMPLETA = "Preencha nome, quantidade e valor de cada produto.";
export const ERRO_TOTAL_ZERO = "A venda precisa somar mais que zero.";
export const ERRO_TOTAL_ALTO = "O total passou do limite de uma venda. Divida em mais de uma venda.";
export const ERRO_MUITOS_ITENS = `No máximo ${MAX_ITENS} produtos por venda.`;

/** Uma linha do formulário como a vendedora digita: tudo texto até validar. */
export type LinhaDaVenda = { nome: string; quantidade: string; valor: string };

export const LINHA_VAZIA: LinhaDaVenda = { nome: "", quantidade: "1", valor: "" };

/** Reais em centavos inteiros: 3 × 0,10 em float dá 0,30000000000000004. */
function centavos(reais: number): number {
  return Number.isFinite(reais) ? Math.round(reais * 100) : 0;
}

/**
 * O valor unitário como o banco grava (`numeric(12,2)`): arredondado ao centavo.
 * Mesma leitura de `parseValorDoPedido` que a rota usa — "149,90" e "149.90" valem igual.
 */
function valorUnitario(linha: LinhaDaVenda): number {
  return centavos(parseValorDoPedido(linha.valor)) / 100;
}

/** Inteiro de 1 a 9999 só com dígitos: "2.5", "-2", "1e3" e "0x10" não contam. */
function quantidadeValida(texto: string): number | null {
  const t = texto.trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const quantidade = Number(t);
  return quantidade >= 1 && quantidade <= MAX_QUANTIDADE ? quantidade : null;
}

export function subtotalDaLinha(linha: LinhaDaVenda): number {
  const quantidade = quantidadeValida(linha.quantidade);
  return quantidade === null ? 0 : centavos(quantidade * valorUnitario(linha)) / 100;
}

export function totalDasLinhas(linhas: readonly LinhaDaVenda[]): number {
  return linhas.reduce((soma, linha) => soma + centavos(subtotalDaLinha(linha)), 0) / 100;
}

export function pecasDasLinhas(linhas: readonly LinhaDaVenda[]): number {
  return linhas.reduce((soma, linha) => soma + (quantidadeValida(linha.quantidade) ?? 0), 0);
}

export function rotuloDePecas(pecas: number): string {
  return pecas === 1 ? "1 peça" : `${pecas} peças`;
}

function itemDaLinha(linha: LinhaDaVenda): ItemDeVenda | null {
  const nome = linha.nome.trim();
  const quantidade = quantidadeValida(linha.quantidade);
  const valor = parseValorDoPedido(linha.valor);
  if (nome === "" || nome.length > MAX_NOME_DO_PRODUTO) return null;
  if (quantidade === null) return null;
  if (!Number.isFinite(valor) || valor < 0 || valor > MAX_VALOR) return null;
  return { nome, quantidade, valorUnitario: valorUnitario(linha) };
}

export type Validacao = { ok: true; itens: ItemDeVenda[] } | { ok: false; erro: string };

/** Item de R$ 0,00 passa (brinde); a venda inteira precisa somar mais que zero (spec §6). */
export function validarLinhas(linhas: readonly LinhaDaVenda[]): Validacao {
  if (linhas.length > MAX_ITENS) return { ok: false, erro: ERRO_MUITOS_ITENS };
  const itens = linhas.map(itemDaLinha).filter((item): item is ItemDeVenda => item !== null);
  if (itens.length === 0 || itens.length !== linhas.length) return { ok: false, erro: ERRO_LINHA_INCOMPLETA };
  const total = totalDasLinhas(linhas);
  if (total <= 0) return { ok: false, erro: ERRO_TOTAL_ZERO };
  if (total > MAX_TOTAL) return { ok: false, erro: ERRO_TOTAL_ALTO };
  return { ok: true, itens };
}

/** "Vestido midi ×2 · Cropped ×1"; pedido antigo, sem itens, diz isso (spec §2). */
export function resumoDosItens(itens: readonly ItemDeVenda[]): string {
  if (itens.length === 0) return "Pedido sem itens";
  return itens.map((item) => `${item.nome} ×${item.quantidade}`).join(" · ");
}

/** O valor de volta no campo, como ela digitaria: 119.9 → "119,90". */
export function valorParaCampo(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

/** Corrigir abre o formulário com os itens da venda; pedido sem itens começa numa linha vazia. */
export function linhasDaVenda(venda: Pick<VendaDoMes, "itens">): LinhaDaVenda[] {
  if (venda.itens.length === 0) return [LINHA_VAZIA];
  return venda.itens.map((item) => ({
    nome: item.nome,
    quantidade: String(item.quantidade),
    valor: valorParaCampo(item.valorUnitario),
  }));
}

/** Quem comprou, como a lista e a confirmação mostram: o nome, o número formatado, ou "Cliente sem nome". */
export function nomeDoCliente(venda: Pick<VendaDoMes, "cliente" | "telefone">): string {
  return venda.cliente?.trim() || formatPhoneBR(venda.telefone) || "Cliente sem nome";
}

/** "hoje 11:08", "ontem 17:42", "03/10 15:20" — no fuso de Brasília, como o resto do painel. */
export function quandoFoi(iso: string, agora: Date): string {
  const dia = dayBROf(iso);
  if (!dia) return "";
  const hora = horaBR(iso);
  if (dia === dayBR(agora)) return `hoje ${hora}`;
  if (dia === dayBRAgo(1, agora)) return `ontem ${hora}`;
  return `${diaMesBR(iso)} ${hora}`;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

/** "2026-10" → "outubro" (o `mes` de `VendasDoMes`); lixo vira "". */
export function nomeDoMes(mes: string): string {
  const numero = Number(/^\d{4}-(\d{2})$/.exec(mes)?.[1]);
  return MESES[numero - 1] ?? "";
}

export function rotuloDeVendas(quantidade: number): string {
  if (quantidade === 0) return "nenhuma venda";
  return quantidade === 1 ? "1 venda" : `${quantidade} vendas`;
}

/** Nomes que ela já usou no mês, para o `<datalist>`: sem repetir, o mais recente primeiro. */
export function nomesDeProdutos(vendas: readonly Pick<VendaDoMes, "itens">[]): string[] {
  const vistos = new Map<string, string>();
  for (const venda of vendas) {
    for (const item of venda.itens) {
      const nome = item.nome.trim();
      const chave = nome.toLocaleLowerCase("pt-BR");
      if (chave && !vistos.has(chave)) vistos.set(chave, nome);
    }
  }
  return [...vistos.values()];
}

/** O `{ error }` das rotas de vendas; o 403 do guard vem em texto puro (`MENSAGEM_BLOQUEIO`) e cai no padrão. */
export function mensagemDeErro(corpo: unknown, padrao: string): string {
  const erro = (corpo as { error?: unknown } | null)?.error;
  return typeof erro === "string" && erro.trim() ? erro : padrao;
}
