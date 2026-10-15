import "server-only";

import { z } from "zod";

import { duasCasas } from "@/lib/resultados/anuncios-tela";
import {
  aparar,
  MAX_CAMPANHA,
  MAX_VALOR,
  type CorpoDoGasto,
  type LancamentoDeGasto,
} from "@/lib/resultados/gasto-de-anuncio";
import { dataValida } from "@/lib/resultados/periodo-anuncios";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const TABLE = "ad_spend";
const COLUNAS = "id, utm_campaign, starts_on, ends_on, amount";
// ponytail: teto fixo; gasto é lançado à mão, poucos por mês. Paginar se uma loja passar disso
// (o relatório não depende desta lista: o SQL lê ad_spend inteiro).
const LIMITE = 500;

/**
 * Corpo de POST e PATCH: os mesmos limites do `check` de `public.ad_spend`, para
 * a violação virar 400 com mensagem em vez do 500 do banco. `strictObject`: o
 * corpo nunca escolhe a loja (`tenant_id` a mais é recusado). O nome é aparado
 * com `aparar` (só espaço, como o `btrim` do relatório), nunca com `.trim()`.
 */
export const corpoDoGasto = z
  .strictObject({
    utm_campaign: z.string().transform(aparar).pipe(z.string().min(1).max(MAX_CAMPANHA)),
    // numeric(12, 2): valida o que vai ser gravado, já em centavos (0,004 vira 0 e é recusado).
    amount: z
      .number()
      .transform(duasCasas)
      .refine((v) => v > 0 && v <= MAX_VALOR),
    starts_on: z.string().refine(dataValida),
    ends_on: z.string().refine(dataValida),
  })
  .refine((c) => c.ends_on >= c.starts_on);

export const ERRO_DO_CORPO = "Confira a campanha, o valor (até R$ 10.000.000) e as datas (a final não pode vir antes).";

type Linha = { id: string; utm_campaign: string; starts_on: string; ends_on: string; amount: number | string };

function lancamento(l: Linha): LancamentoDeGasto {
  return { id: l.id, utm_campaign: l.utm_campaign, starts_on: l.starts_on, ends_on: l.ends_on, amount: Number(l.amount) };
}

/** Lançamentos da loja, do mais recente para o mais antigo. */
export async function listarGastos(tenantId: string): Promise<LancamentoDeGasto[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(COLUNAS)
    .eq("tenant_id", tenantId)
    .order("starts_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIMITE);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Linha[]).map(lancamento);
}

export async function criarGasto(tenantId: string, autor: string | null, corpo: CorpoDoGasto): Promise<LancamentoDeGasto> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({ ...corpo, tenant_id: tenantId, created_by: autor })
    .select(COLUNAS)
    .single();
  if (error) throw new Error(error.message);
  return lancamento(data as Linha);
}

/**
 * Troca os quatro campos. O filtro de `tenant_id` é a proteção: o service-role
 * passa por cima do RLS, e sem ele um id de outra loja seria editado. `null`
 * quando o id não é desta loja (ou não existe).
 */
export async function editarGasto(tenantId: string, id: string, corpo: CorpoDoGasto): Promise<LancamentoDeGasto | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ ...corpo, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(COLUNAS);
  if (error) throw new Error(error.message);
  const linha = (data as Linha[] | null)?.[0];
  return linha ? lancamento(linha) : null;
}

/** `false` quando o id não é desta loja (ou não existe). */
export async function excluirGasto(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
