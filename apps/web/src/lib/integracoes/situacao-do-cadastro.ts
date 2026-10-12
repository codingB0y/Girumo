// apps/web/src/lib/integracoes/situacao-do-cadastro.ts
import { dayBROf, diaMesBR, horaBR } from "@/lib/date-br";
import { chaveDoTelefone, telefoneMascarado } from "@/lib/pages/phone";

/**
 * A situação de cada um dos últimos cadastros na tela de integração (spec
 * 2026-10-10-funil-anuncios §3), pela MESMA regra de §1 que `attribution_report`
 * aplica no banco: vale o último cadastro da pessoa (chave de telefone) antes do
 * evento — entrada até 7 dias antes, pedido até 90, bordas inclusivas, empate
 * pelo id maior.
 *
 * Puro e sem `server-only`: a tela importa os tipos daqui.
 *
 * ponytail: só os cadastros do SITE disputam o crédito; os das páginas /p/
 * (`lp_captures`, 7 no banco inteiro em 10/10) ficam de fora. Se as páginas
 * crescerem, ler os dois aqui como a função do banco lê.
 */

const DIA_MS = 86_400_000;
export const JANELA_ENTRADA_MS = 7 * DIA_MS;
export const JANELA_VENDA_MS = 90 * DIA_MS;
const SEM_UTM = "(sem UTM)";
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type CadastroLido = {
  id: string;
  whatsapp: string;
  phone_key: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  created_at: string;
};
export type CadastroDaChave = Pick<CadastroLido, "id" | "phone_key" | "created_at">;
export type LeadLido = { id: string; phone: string | null; entered_at: string };
export type PedidoLido = {
  id: string;
  phone: string | null;
  lead_id: string | null;
  value: number | string;
  created_at: string;
};

export type HistoricoDosCadastros = {
  /** Os últimos cadastros, do mais novo ao mais antigo. */
  ultimos: CadastroLido[];
  /** Todos os cadastros do site com as mesmas chaves (disputam o crédito). */
  daChave: CadastroDaChave[];
  leads: LeadLido[];
  pedidos: PedidoLido[];
  /** Ids de cadastro com pelo menos um clique no link do grupo. */
  comClique: ReadonlySet<string>;
};

export type LinhaDoCadastro = { hora: string; telefone_mascarado: string; anuncio: string; situacao: string };

const ms = (iso: string) => Date.parse(iso);

/** O cadastro que leva o crédito do evento: o último da mesma chave em [instante − janela, instante]. */
export function cadastroCreditado(
  chave: string,
  instante: string,
  janelaMs: number,
  cadastros: readonly CadastroDaChave[],
): string | null {
  const fim = ms(instante);
  let melhor: { id: string; t: number } | null = null;
  for (const c of cadastros) {
    const t = ms(c.created_at);
    if (c.phone_key !== chave || t > fim || t < fim - janelaMs) continue;
    if (!melhor || t > melhor.t || (t === melhor.t && c.id > melhor.id)) melhor = { id: c.id, t };
  }
  return melhor?.id ?? null;
}

/** Soma dos pedidos creditados ao cadastro; `null` = nenhum. */
function vendidoAoCadastro(
  c: CadastroLido,
  chave: string,
  h: HistoricoDosCadastros,
  cadastros: readonly CadastroDaChave[],
): number | null {
  const telefoneDoLead = new Map(h.leads.map((l) => [l.id, l.phone]));
  let total: number | null = null;
  for (const p of h.pedidos) {
    // O mesmo `coalesce(nullif(btrim(o.phone), ''), l.phone)` da função do banco.
    const telefone = p.phone?.trim() || (p.lead_id ? telefoneDoLead.get(p.lead_id) : null);
    if (chaveDoTelefone(telefone) !== chave) continue;
    if (cadastroCreditado(chave, p.created_at, JANELA_VENDA_MS, cadastros) !== c.id) continue;
    total = (total ?? 0) + (Number(p.value) || 0);
  }
  return total;
}

function textoDaEntrada(entrada: string, cadastro: string): string {
  const hora = horaBR(entrada);
  return dayBROf(entrada) === dayBROf(cadastro)
    ? `Entrou no grupo às ${hora}`
    : `Entrou no grupo em ${diaMesBR(entrada)} às ${hora}`;
}

/** Comprou › Já era do grupo › Entrou › Foi pro grupo › Ainda não abriu. */
function situacao(c: CadastroLido, h: HistoricoDosCadastros, cadastros: readonly CadastroDaChave[]): string {
  const chave = c.phone_key;
  if (chave) {
    const vendido = vendidoAoCadastro(c, chave, h, cadastros);
    if (vendido !== null) return `Comprou · ${BRL.format(vendido)}`;
    const entradas = h.leads
      .filter((l) => chaveDoTelefone(l.phone) === chave)
      .map((l) => l.entered_at)
      .sort((a, b) => ms(a) - ms(b));
    if (entradas.length > 0 && ms(entradas[0]) < ms(c.created_at)) return "Já era do grupo";
    const entrada = entradas.find((e) => cadastroCreditado(chave, e, JANELA_ENTRADA_MS, cadastros) === c.id);
    if (entrada) return textoDaEntrada(entrada, c.created_at);
  }
  return h.comClique.has(c.id) ? "Foi pro grupo, ainda não entrou" : "Ainda não abriu o link do grupo";
}

export function situacoesDosCadastros(h: HistoricoDosCadastros): LinhaDoCadastro[] {
  const porId = new Map<string, CadastroDaChave>();
  for (const c of [...h.daChave, ...h.ultimos]) porId.set(c.id, c);
  const cadastros = [...porId.values()];
  return h.ultimos.map((c) => ({
    hora: c.created_at,
    telefone_mascarado: telefoneMascarado(c.whatsapp),
    anuncio: c.utm_content?.trim() || c.utm_campaign?.trim() || SEM_UTM,
    situacao: situacao(c, h, cadastros),
  }));
}
