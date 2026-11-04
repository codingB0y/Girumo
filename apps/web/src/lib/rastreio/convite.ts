import "server-only";

import { campaignLinkPath } from "@/lib/custom-domains/host";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTrackedLinkById } from "@/lib/stores/tracked-links";
import { variantesDoTelefone } from "@/lib/vendas/telefone";

import { linkDaBusca } from "./link";
import type { LojaDoRastreio } from "./loja";

export type DepsDoConvite = {
  linkPorId: (tenantId: string, id: string) => Promise<{ slug: string } | null>;
  jaEhLead: (tenantId: string, telefones: string[]) => Promise<boolean>;
};

const DEPS: DepsDoConvite = {
  linkPorId: async (tenantId, id) => {
    const link = await getTrackedLinkById(tenantId, id);
    return link ? { slug: link.slug } : null;
  },
  jaEhLead: async (tenantId, telefones) => {
    // `leads` não tem phone_key (só um índice de expressão que o PostgREST não filtra): casa por `phone`.
    const { data, error } = await getSupabaseAdmin()
      .from("leads")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("phone", telefones)
      .limit(1);
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  },
};

/**
 * Link público do grupo VIP da loja para o e-mail do pedido; `null` = sem convite
 * (sem VIP configurado, link apagado, quem já está nos grupos ou falha: o aviso não espera por isso).
 */
export async function conviteDoGrupo(
  loja: LojaDoRastreio,
  telefone: string | null,
  deps: DepsDoConvite = DEPS,
): Promise<{ url: string } | null> {
  if (!loja.vipLinkId) return null;
  try {
    const link = await deps.linkPorId(loja.tenantId, loja.vipLinkId);
    if (!link) return null;
    const variantes = telefone ? variantesDoTelefone(telefone) : null;
    if (variantes && (await deps.jaEhLead(loja.tenantId, variantes))) return null;
    const origem = new URL(linkDaBusca(loja)).origin;
    return { url: origem + campaignLinkPath(origem, link.slug) };
  } catch {
    console.warn(`[rastreio] convite do grupo falhou (tenant ${loja.tenantId})`);
    return null;
  }
}
