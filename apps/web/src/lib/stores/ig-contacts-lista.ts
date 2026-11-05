import "server-only";

import { isValidFieldKey } from "@/lib/ig/flow/names";
import { applyContact, CONTACT_COLS, type IgContactRow } from "@/lib/stores/ig-contacts";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Lista, filtros, edição e etiqueta em massa da tela Pessoas (a gravação atômica mora em `ig-contacts.ts`). */

export const PAGE_SIZE = 50;
/** O PostgREST corta qualquer leitura em 1000 sem avisar: toda varredura anda de 1000 em 1000. */
const LOTE = 1000;
/** Teto de uma varredura (etiqueta em massa, CSV). Passou disso, erro explícito em vez de resultado cortado. */
export const LIMITE_VARREDURA = 20_000;
/** Etiqueta em massa por filtro: 1 RPC por ficha, então o teto é menor (cabe no `maxDuration` da rota). */
export const LIMITE_EM_MASSA = 5_000;
const SIMULTANEAS = 25;

export type Recencia = "24h" | "7d" | "30d" | "tudo";
export type ContactFilters = {
  /** Trecho do @ (com ou sem "@"). */
  q?: string;
  /** "Tem todas". */
  tags?: string[];
  field?: { key: string; value: string };
  recencia?: Recencia;
};

const JANELA_MS: Record<Exclude<Recencia, "tudo">, number> = { "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 };

export class LimiteDeVarredura extends Error {
  constructor(limite: number = LIMITE_VARREDURA) {
    super(`Mais de ${limite} pessoas nesse filtro. Afine os filtros e tente de novo.`);
  }
}

/** Texto digitado vira padrão de `ilike` literal: `%` e `_` perdem o curinga; `*` (curinga do PostgREST) sai. */
export function escapeLike(texto: string): string {
  return texto
    .replace(/^@+/, "")
    .replace(/[\\%_*]/g, (c) => (c === "*" ? "" : `\\${c}`))
    .trim();
}

/** O pedaço do builder do PostgREST que os filtros usam (o tipo genérico completo estoura a profundidade do TS). */
interface Filtravel {
  eq(coluna: string, valor: string): Filtravel;
  ilike(coluna: string, padrao: string): Filtravel;
  contains(coluna: string, valor: string[]): Filtravel;
  gte(coluna: string, valor: string): Filtravel;
}

function aplicarFiltros<Q>(consulta: Q, tenantId: string, f: ContactFilters, agoraMs: number): Q {
  let q = (consulta as unknown as Filtravel).eq("tenant_id", tenantId);
  const trecho = f.q ? escapeLike(f.q) : "";
  if (trecho) q = q.ilike("username", `%${trecho}%`);
  if (f.tags?.length) q = q.contains("tags", f.tags);
  // A chave vem de fora e entra no NOME da coluna: só passa se tiver o formato de campo.
  if (f.field && isValidFieldKey(f.field.key)) q = q.eq(`fields->>${f.field.key}`, f.field.value);
  if (f.recencia && f.recencia !== "tudo") q = q.gte("last_seen_at", new Date(agoraMs - JANELA_MS[f.recencia]).toISOString());
  return q as unknown as Q;
}

export type ContactPage = { rows: IgContactRow[]; total: number };

/** Uma página (50), da conversa mais recente para a mais antiga, com o total contado à parte. */
export async function listContacts(tenantId: string, f: ContactFilters, pagina: number, agoraMs: number = Date.now()): Promise<ContactPage> {
  const db = getSupabaseAdmin();
  const de = (Math.max(1, pagina) - 1) * PAGE_SIZE;
  const [lista, contagem] = await Promise.all([
    aplicarFiltros(db.from("ig_contacts").select(CONTACT_COLS), tenantId, f, agoraMs)
      .order("last_seen_at", { ascending: false })
      .order("id", { ascending: true })
      .range(de, de + PAGE_SIZE - 1),
    aplicarFiltros(db.from("ig_contacts").select("id", { count: "exact", head: true }), tenantId, f, agoraMs),
  ]);
  if (lista.error) throw new Error(lista.error.message);
  if (contagem.error) throw new Error(contagem.error.message);
  return { rows: (lista.data ?? []) as unknown as IgContactRow[], total: contagem.count ?? 0 };
}

/** Todas as pessoas do filtro, em lotes de 1000. Passou do teto: `LimiteDeVarredura`, nunca lista cortada. */
export async function collectContacts(tenantId: string, f: ContactFilters, agoraMs: number = Date.now(), limite: number = LIMITE_VARREDURA): Promise<IgContactRow[]> {
  const todas: IgContactRow[] = [];
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await aplicarFiltros(getSupabaseAdmin().from("ig_contacts").select(CONTACT_COLS), tenantId, f, agoraMs)
      .order("id", { ascending: true })
      .range(de, de + LOTE - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as unknown as IgContactRow[];
    todas.push(...lote);
    if (todas.length > limite) throw new LimiteDeVarredura(limite);
    if (lote.length < LOTE) return todas;
  }
}

/** Pessoas pelos ids (da loja: id de outra loja simplesmente não volta). */
async function contactsByIds(tenantId: string, ids: string[]): Promise<IgContactRow[]> {
  const achadas: IgContactRow[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await getSupabaseAdmin().from("ig_contacts").select(CONTACT_COLS).eq("tenant_id", tenantId).in("id", ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    achadas.push(...((data ?? []) as unknown as IgContactRow[]));
  }
  return achadas;
}

export type EdicaoDaFicha = {
  /** Campo com valor `null` é apagado. */
  set?: Record<string, string | number | boolean | null>;
  add?: string[];
  remove?: string[];
};

/**
 * Edição pela tela. A hora da interação é a que a ficha já tem: editar à mão não conta como ela ter
 * escrito (`ig_contact_apply` só anda `last_seen_at` para frente, então repetir o valor não mexe).
 */
export async function editContact(tenantId: string, atual: IgContactRow, edicao: EdicaoDaFicha): Promise<IgContactRow | null> {
  const nova = await applyContact(tenantId, { igUserId: atual.ig_user_id, username: atual.username, ...edicao, seenAt: atual.last_seen_at, dm: false });
  if (nova.id === atual.id) return nova;
  // `ig_contact_apply` é upsert: id diferente = a pessoa foi apagada entre a leitura e a gravação e a função
  // criou uma ficha nova. Apaga essa (LGPD: apagar não pode voltar) e trata a pessoa como ausente.
  const { error } = await getSupabaseAdmin().from("ig_contacts").delete().eq("tenant_id", tenantId).eq("id", nova.id);
  if (error) throw new Error(error.message);
  return null;
}

export type AlvoEmMassa = { ids: string[] } | { filtros: ContactFilters };

/** Pôr/tirar etiqueta em quem foi selecionado ou em todos os filtrados. Devolve quantas fichas foram tocadas. */
export async function bulkTags(tenantId: string, alvo: AlvoEmMassa, add: string[], remove: string[], agoraMs: number = Date.now()): Promise<number> {
  // Lê TUDO antes de gravar: mudar etiqueta enquanto pagina o filtro "tem todas" faria as páginas andarem.
  const pessoas = "ids" in alvo ? await contactsByIds(tenantId, alvo.ids) : await collectContacts(tenantId, alvo.filtros, agoraMs, LIMITE_EM_MASSA);
  let atualizadas = 0;
  for (let i = 0; i < pessoas.length; i += SIMULTANEAS) {
    const feitas = await Promise.all(pessoas.slice(i, i + SIMULTANEAS).map((p) => editContact(tenantId, p, { add, remove })));
    atualizadas += feitas.filter((f) => f !== null).length;
  }
  return atualizadas;
}
