import "server-only";

import type { Periodo } from "@/lib/resultados/periodo-anuncios";
import { lerRelatorioAnuncios, type RelatorioAnuncios } from "@/lib/resultados/relatorio-anuncios";
import {
  lerPessoasDoAnuncio,
  type ChaveDoAnuncio,
  type PessoasDoAnuncio,
} from "@/lib/resultados/pessoas-do-anuncio";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * `attribution_report` recusou o período (`raise exception ... errcode 22023`).
 * A rota valida antes com as mesmas regras; isto é a rede de segurança se as
 * duas divergirem — vira 400, não 500.
 */
export class PeriodoRecusado extends Error {}

/**
 * Funil de anúncios da loja no período (`public.attribution_report`, só
 * `service_role`). O tenant vai explícito porque o service-role passa por cima
 * do RLS: é este parâmetro que isola as lojas. O JSON passa pelo contrato zod
 * antes de sair daqui — formato que mudar no SQL quebra com mensagem, não vira zero.
 */
export async function relatorioDeAnuncios(tenantId: string, periodo: Periodo): Promise<RelatorioAnuncios> {
  const { data, error } = await getSupabaseAdmin().rpc("attribution_report", {
    p_tenant: tenantId,
    p_de: periodo.de,
    p_ate: periodo.ate,
  });
  if (error) throw error.code === "22023" ? new PeriodoRecusado(error.message) : new Error(error.message);
  return lerRelatorioAnuncios(data);
}

/**
 * A loja já recebeu algum cadastro, de qualquer período? Separa "ainda não
 * conectou nada" (tela Vazio) de "nada neste período" (funil zerado com aviso).
 * Uma linha basta: `limit(1)` nas duas fontes que o relatório lê.
 */
export async function temCadastroComOrigem(tenantId: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const [site, pagina] = await Promise.all([
    db.from("site_captures").select("id").eq("tenant_id", tenantId).limit(1),
    db.from("lp_captures").select("id").eq("tenant_id", tenantId).limit(1),
  ]);
  if (site.error) throw new Error(site.error.message);
  if (pagina.error) throw new Error(pagina.error.message);
  return (site.data?.length ?? 0) > 0 || (pagina.data?.length ?? 0) > 0;
}

/**
 * Quem veio por um anúncio no período (`public.attribution_people`, só
 * `service_role`): a mesma regra de `relatorioDeAnuncios`, com as pessoas no
 * lugar das contagens. O tenant vai explícito pelo mesmo motivo — é ele que
 * isola as lojas. O telefone sai inteiro daqui: quem responde ao navegador
 * mascara (`paraAGaveta`).
 */
export async function pessoasDoAnuncio(
  tenantId: string,
  periodo: Periodo,
  chave: ChaveDoAnuncio,
): Promise<PessoasDoAnuncio> {
  const { data, error } = await getSupabaseAdmin().rpc("attribution_people", {
    p_tenant: tenantId,
    p_de: periodo.de,
    p_ate: periodo.ate,
    p_campanha: chave.campanha,
    p_conjunto: chave.conjunto,
    p_anuncio: chave.anuncio,
  });
  if (error) throw error.code === "22023" ? new PeriodoRecusado(error.message) : new Error(error.message);
  return lerPessoasDoAnuncio(data);
}
