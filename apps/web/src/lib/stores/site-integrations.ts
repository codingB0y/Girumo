import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

const TABLE = "site_integrations";
// Sem key_hash: o hash entra no filtro e nunca volta na resposta.
const COLS = "tenant_id, key_last4, tracked_link_id, created_at, rotated_at, last_used_at";

export type SiteIntegration = {
  tenantId: string;
  keyLast4: string;
  trackedLinkId: string;
  createdAt: string;
  rotatedAt: string | null;
  lastUsedAt: string | null;
};

type Row = {
  tenant_id: string;
  key_last4: string;
  tracked_link_id: string;
  created_at: string;
  rotated_at: string | null;
  last_used_at: string | null;
};

function toIntegration(r: Row): SiteIntegration {
  return {
    tenantId: r.tenant_id,
    keyLast4: r.key_last4,
    trackedLinkId: r.tracked_link_id,
    createdAt: r.created_at,
    rotatedAt: r.rotated_at,
    lastUsedAt: r.last_used_at,
  };
}

/**
 * Única leitura SEM `.eq("tenant_id")`, e de propósito: é a chave que descobre a
 * loja (ponto de entrada público, como getTrackedLinkBySlug). `key_hash` é único,
 * então no máximo uma linha casa, e o tenant_id dela filtra todo o resto.
 */
export async function integracaoPelaChave(keyHash: string): Promise<SiteIntegration | null> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).select(COLS).eq("key_hash", keyHash).limit(1);
  if (error) throw new Error(error.message);
  const linha = (data as Row[] | null)?.[0];
  return linha ? toIntegration(linha) : null;
}

export async function integracaoDaLoja(tenantId: string): Promise<SiteIntegration | null> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).select(COLS).eq("tenant_id", tenantId).limit(1);
  if (error) throw new Error(error.message);
  const linha = (data as Row[] | null)?.[0];
  return linha ? toIntegration(linha) : null;
}

/** Uma integração por loja: gerar outra chave sobrescreve o hash, e a anterior para na hora. */
export async function salvarChave(
  tenantId: string,
  chave: { hash: string; last4: string; trackedLinkId: string },
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      {
        tenant_id: tenantId,
        key_hash: chave.hash,
        key_last4: chave.last4,
        tracked_link_id: chave.trackedLinkId,
        rotated_at: new Date().toISOString(),
        last_used_at: null, // chave nova nunca foi usada
      },
      { onConflict: "tenant_id" },
    );
  if (error) throw new Error(error.message);
}

export async function marcarUso(tenantId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ last_used_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}
