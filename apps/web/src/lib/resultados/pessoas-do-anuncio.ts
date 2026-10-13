// apps/web/src/lib/resultados/pessoas-do-anuncio.ts
import { z } from "zod";

import type { Lead } from "@/lib/painel/types";
import { telefoneMascarado } from "@/lib/pages/phone";
import type { Periodo } from "./periodo-anuncios";

/**
 * Quem veio por um anúncio (gaveta "Ver quem" da aba Anúncios; spec
 * 2026-10-10-funil-anuncios §4 e §7): o contrato do JSON de
 * `public.attribution_people`, a versão que sai para o navegador (telefone
 * mascarado, sem id de contato) e a busca na URL que a rota e o Contatos
 * filtrado leem.
 *
 * Sem `server-only`: a gaveta e o Contatos importam os tipos e a busca daqui.
 */

const contagem = z.number().int().nonnegative();
/** Soma de `orders.value`: outro caminho grava estorno como pedido negativo (decisão do PR 5). */
const vendido = z.number();

const compradorSchema = z.object({
  lead_id: z.string().nullable(),
  nome: z.string().nullable(),
  telefone: z.string().nullable(),
  grupo: z.string().nullable(),
  cadastro_em: z.string(),
  primeira_compra: z.string(),
  pedidos: contagem,
  vendido,
});

const pessoasSchema = z.object({
  por_origem: z.array(z.object({ origem: z.string().nullable(), cadastros: contagem, vendido })),
  compradores: z.array(compradorSchema),
  sem_compra: z.array(z.string()),
});

export type PessoasDoAnuncio = z.infer<typeof pessoasSchema>;

export function lerPessoasDoAnuncio(bruto: unknown): PessoasDoAnuncio {
  const lido = pessoasSchema.safeParse(bruto);
  if (!lido.success) {
    const primeiro = lido.error.issues[0];
    throw new Error(`pessoas invalidas: ${primeiro?.path.join(".") ?? "?"} ${primeiro?.message ?? ""}`.trim());
  }
  return lido.data;
}

export type CompradorDaGaveta = {
  nome: string | null;
  /** Sempre mascarado: `(62) 9••••-4821`. */
  telefone: string;
  grupo: string | null;
  cadastro_em: string;
  primeira_compra: string;
  pedidos: number;
  vendido: number;
  /** Tem contato (entrou num grupo). */
  em_contatos: boolean;
};

export type PessoasDaGaveta = {
  por_origem: PessoasDoAnuncio["por_origem"];
  compradores: CompradorDaGaveta[];
  /**
   * Contatos distintos entre os compradores: o N de "Ver os N em Contatos".
   * Duas chaves de telefone podem cair no mesmo contato (pedido com `lead_id`
   * e telefone diferente do dele); a lista de `lista=compraram` deduplica, e o
   * N tem que bater com ela.
   */
  contatos_dos_compradores: number;
  /** Quantos entraram pelo anúncio e não compraram nada depois de entrar. */
  sem_compra: number;
};

/**
 * O que a gaveta recebe (spec §7): telefone mascarado aqui, no servidor; o id do
 * contato vira só "está em Contatos" e a lista de quem não comprou vira contagem.
 */
export function paraAGaveta(p: PessoasDoAnuncio): PessoasDaGaveta {
  const contatos = new Set(p.compradores.flatMap((c) => (c.lead_id ? [c.lead_id] : [])));
  return {
    por_origem: p.por_origem,
    compradores: p.compradores.map((c) => ({
      nome: c.nome,
      telefone: telefoneMascarado(c.telefone),
      grupo: c.grupo,
      cadastro_em: c.cadastro_em,
      primeira_compra: c.primeira_compra,
      pedidos: c.pedidos,
      vendido: c.vendido,
      em_contatos: c.lead_id !== null,
    })),
    contatos_dos_compradores: contatos.size,
    sem_compra: p.sem_compra.length,
  };
}

/** Como a tela chama o nulo de cada campo de UTM. */
export const SEM_CAMPANHA = "(sem UTM)";
export const SEM_CONJUNTO = "(sem conjunto)";
export const SEM_ANUNCIO = "(sem anúncio)";

export const LISTAS_DE_PESSOAS = ["compraram", "sem-compra"] as const;
export type ListaDePessoas = (typeof LISTAS_DE_PESSOAS)[number];

/** Um anúncio da tabela. Nulo = `SEM_CAMPANHA` / `SEM_CONJUNTO` / `SEM_ANUNCIO`. */
export type ChaveDoAnuncio = { campanha: string | null; conjunto: string | null; anuncio: string | null };

const CAMPOS = ["campanha", "conjunto", "anuncio"] as const;
/**
 * Teto de sanidade da URL, não de UTM: `site_captures` corta em 200 (PR 2), mas
 * `lp_captures` (páginas /p/) grava sem teto — recusar acima de 200 deixaria sem
 * gaveta o anúncio de nome longo de página.
 */
export const MAX_BUSCA = 2000;

/**
 * `de=…&ate=…&campanha=…&conjunto=…&anuncio=…[&lista=…]`. Campo nulo fica fora
 * da URL: na volta, ausente e vazio viram nulo, que é como o SQL compara
 * (`nullif(btrim(...), '')` dos dois lados).
 */
export function buscaDoAnuncio(periodo: Periodo, chave: ChaveDoAnuncio, lista?: ListaDePessoas): string {
  const busca = new URLSearchParams({ de: periodo.de, ate: periodo.ate });
  for (const campo of CAMPOS) {
    const valor = chave[campo];
    if (valor !== null) busca.set(campo, valor);
  }
  if (lista) busca.set("lista", lista);
  return busca.toString();
}

/** O Contatos só com quem veio pelo anúncio (a página lê o filtro no mount, PR 6c). */
export function hrefDeContatos(periodo: Periodo, chave: ChaveDoAnuncio, lista: ListaDePessoas): string {
  return `/painel/contatos?${buscaDoAnuncio(periodo, chave, lista)}`;
}

export type AnuncioLido =
  | { ok: true; chave: ChaveDoAnuncio; lista: ListaDePessoas | null }
  | { ok: false; erro: string };

/** Lê o anúncio da busca. Não apara: o SQL apara os dois lados; só o vazio vira nulo. */
export function anuncioDaBusca(busca: URLSearchParams): AnuncioLido {
  const lista = busca.get("lista");
  if (lista !== null && !(LISTAS_DE_PESSOAS as readonly string[]).includes(lista)) {
    return { ok: false, erro: "Lista inválida." };
  }
  const ler = (campo: (typeof CAMPOS)[number]) => busca.get(campo) || null;
  const chave: ChaveDoAnuncio = { campanha: ler("campanha"), conjunto: ler("conjunto"), anuncio: ler("anuncio") };
  if (Object.values(chave).some((v) => v !== null && v.length > MAX_BUSCA)) {
    return { ok: false, erro: "Anúncio inválido." };
  }
  return { ok: true, chave, lista: lista as ListaDePessoas | null };
}

export type FiltroDoAnuncio = { chave: ChaveDoAnuncio; lista: ListaDePessoas; busca: string };

/**
 * O filtro do Contatos vindo da gaveta: `search` é o `window.location.search`.
 * Sem `lista` válida não é filtro — o Contatos fica como sempre foi.
 */
export function filtroDaUrl(search: string): FiltroDoAnuncio | null {
  const busca = new URLSearchParams(search);
  const lido = anuncioDaBusca(busca);
  if (!lido.ok || lido.lista === null) return null;
  return { chave: lido.chave, lista: lido.lista, busca: busca.toString() };
}

/** Guarda leve no navegador: a rota já validou com zod; aqui só se recusa o que não é a resposta. */
export function ehPessoasDaGaveta(corpo: unknown): corpo is PessoasDaGaveta {
  const c = corpo as Partial<PessoasDaGaveta> | null;
  return (
    typeof c?.sem_compra === "number" &&
    typeof c.contatos_dos_compradores === "number" &&
    Array.isArray(c.compradores) &&
    Array.isArray(c.por_origem)
  );
}

/** Resposta da rota com `lista=`: os contatos inteiros, no formato do `/api/leads`. */
export type ContatosDoAnuncio = { contatos: Lead[] };

export function ehContatosDoAnuncio(corpo: unknown): corpo is ContatosDoAnuncio {
  return Array.isArray((corpo as Partial<ContatosDoAnuncio> | null)?.contatos);
}
