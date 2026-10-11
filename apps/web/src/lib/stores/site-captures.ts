import "server-only";

import type { CadastroDoSite } from "@/lib/integracoes/cadastro-do-site";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const TABLE = "site_captures";
const UNIQUE_VIOLATION = "23505";

/**
 * Grava o cadastro do site. O mesmo `event_id` na mesma loja (o site reenvia no
 * segundo toque) devolve o cadastro que já existe, com `novo = false`.
 * Nunca recebe nem grava IP ou user-agent (spec §7).
 */
export async function gravarCadastro(
  tenantId: string,
  trackedLinkId: string,
  cadastro: CadastroDoSite,
): Promise<{ id: string; novo: boolean }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
      tracked_link_id: trackedLinkId,
      whatsapp: cadastro.whatsapp,
      event_id: cadastro.eventId,
      page_url: cadastro.pageUrl,
      utm_source: cadastro.utm.source,
      utm_medium: cadastro.utm.medium,
      utm_campaign: cadastro.utm.campaign,
      utm_content: cadastro.utm.content,
      utm_term: cadastro.utm.term,
      fbclid: cadastro.fbclid,
      fbc: cadastro.fbc,
      fbp: cadastro.fbp,
    })
    .select("id")
    .single();
  if (!error) return { id: (data as { id: string }).id, novo: true };
  if (error.code !== UNIQUE_VIOLATION) throw new Error(error.message);

  const { data: existente, error: erroLeitura } = await supabase
    .from(TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("event_id", cadastro.eventId)
    .limit(1);
  if (erroLeitura) throw new Error(erroLeitura.message);
  const id = (existente as { id: string }[] | null)?.[0]?.id;
  if (!id) throw new Error("cadastro duplicado sumiu entre o insert e a leitura");
  return { id, novo: false };
}

/** O cadastro existe E é desta loja — o /r/ só aceita `cid` que passa aqui (PR 4). */
export async function cadastroDaLoja(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
