import "server-only";

import { z } from "zod";

import type { HashesMeta } from "@/lib/meta/dados-do-cliente";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * `bling_contacts`: cache de 24 h do contato do Bling e a lista da pessoa
 * (spec 2026-10-13-integracao-bling §1 Listas). Service-role ignora o RLS: o
 * `.eq("tenant_id")` de cada query é a proteção real.
 */

const TABLE = "bling_contacts";
const COLS = "bling_contact_id, name, person_type, phone, phone_key, meta_hashes, lista, fetched_at";

export type ListaBling = "alto_valor" | "comprador" | "lead";
type TipoPessoa = "F" | "J" | "E";

export type ContatoGuardado = {
  blingContactId: number;
  name: string | null;
  personType: TipoPessoa | null;
  phone: string | null;
  phoneKey: string | null;
  metaHashes: HashesMeta;
  lista: ListaBling | null;
  fetchedAt: string;
};

export type ContatoNovo = Pick<ContatoGuardado, "blingContactId" | "name" | "personType" | "phone" | "metaHashes">;

type Row = {
  bling_contact_id: number | string;
  name: string | null;
  person_type: TipoPessoa | null;
  phone: string | null;
  phone_key: string | null;
  meta_hashes: unknown;
  lista: ListaBling | null;
  fetched_at: string;
};

// jsonb vai direto pro Meta e pro CSV: formato errado não sai daqui.
const hash = z.string();
const hashesGuardados = z
  .object({
    em: z.array(hash),
    ph: z.array(hash),
    fn: hash,
    ln: hash,
    db: hash,
    doby: hash,
    dobm: hash,
    dobd: hash,
    ge: hash,
    ct: hash,
    st: hash,
    zp: hash,
    country: hash,
    external_id: hash,
  })
  .partial();

function toContato(r: Row): ContatoGuardado {
  const hashes = hashesGuardados.safeParse(r.meta_hashes);
  return {
    blingContactId: Number(r.bling_contact_id),
    name: r.name,
    personType: r.person_type,
    phone: r.phone,
    phoneKey: r.phone_key,
    metaHashes: hashes.success ? hashes.data : {},
    lista: r.lista,
    fetchedAt: r.fetched_at,
  };
}

function toContatos(data: unknown): ContatoGuardado[] {
  return ((data ?? []) as Row[]).map(toContato);
}

export async function lerContato(tenantId: string, id: number): Promise<ContatoGuardado | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(COLS)
    .eq("tenant_id", tenantId)
    .eq("bling_contact_id", id)
    .limit(1);
  if (error) throw new Error(error.message);
  return toContatos(data)[0] ?? null;
}

/**
 * Upsert com `fetched_at = agora`. `phone_key` é gerada pelo banco (volta na
 * resposta) e `lista` é do recálculo: nenhuma das duas vai no corpo, então o
 * conflito preserva a lista que a pessoa já tinha.
 */
export async function salvarContato(tenantId: string, c: ContatoNovo): Promise<ContatoGuardado> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      {
        tenant_id: tenantId,
        bling_contact_id: c.blingContactId,
        name: c.name,
        person_type: c.personType,
        phone: c.phone,
        meta_hashes: c.metaHashes,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,bling_contact_id" },
    )
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return toContato(data as unknown as Row);
}

/** `bling_recompute_lists`: a pessoa do contato, ou a loja toda sem contato. Devolve quantos mudaram de lista. */
export async function recalcularListas(tenantId: string, contato?: number): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc("bling_recompute_lists", {
    p_tenant: tenantId,
    p_contact: contato ?? null,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

/** Para "últimas vendas" do cartão: poucos ids por vez. */
export async function lerContatosPorIds(tenantId: string, ids: readonly number[]): Promise<ContatoGuardado[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabaseAdmin().from(TABLE).select(COLS).eq("tenant_id", tenantId).in("bling_contact_id", ids);
  if (error) throw new Error(error.message);
  return toContatos(data);
}

/** Página do CSV por chave (id > último lido): o PostgREST corta em 1000, então nunca por offset. */
export async function paginaDaLista(
  tenantId: string,
  lista: ListaBling,
  depoisDe: number,
  tamanho: number,
): Promise<ContatoGuardado[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(COLS)
    .eq("tenant_id", tenantId)
    .eq("lista", lista)
    .gt("bling_contact_id", depoisDe)
    .order("bling_contact_id", { ascending: true })
    .limit(tamanho);
  if (error) throw new Error(error.message);
  return toContatos(data);
}
