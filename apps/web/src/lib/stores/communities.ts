import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { criarLinkMestreOuDesfazer, uniqueMasterSlug } from "@/lib/campaigns/master-link";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { comunidadesNativas } from "@/lib/communities/reconciliar";
import type { PapelComunidade } from "@/lib/communities/papel";

/**
 * Comunidades são `campaign_groups` vistas por outra ótica — mesma tabela que
 * `stores/campaign-groups.ts`, sem tabela nova. `whatsapp_community_jid` é
 * NULL enquanto a coleção for só uma gaveta da Girumo (a Fase 0 da comunidade
 * nativa do WhatsApp terminou em 403 — ver
 * docs/superpowers/specs/2026-09-04-gestao-de-comunidade-design.md §6 — então
 * este store não chama a Evolution; fica só no banco).
 */
export type Comunidade = {
  id: string;
  nome: string;
  slug: string;
  groupIds: string[];
  autoGrow: boolean;
  whatsappCommunityJid: string | null;
};

const TABLE = "campaign_groups";
const ROW_FIELDS = "id, name, slug, group_ids, auto_grow, whatsapp_community_jid";

type ComunidadeRow = {
  id: string;
  name: string;
  slug: string;
  group_ids: string[] | null;
  auto_grow: boolean;
  whatsapp_community_jid: string | null;
};

function mapRow(row: ComunidadeRow): Comunidade {
  return {
    id: row.id,
    nome: row.name,
    slug: row.slug,
    groupIds: row.group_ids ?? [],
    autoGrow: row.auto_grow,
    whatsappCommunityJid: row.whatsapp_community_jid,
  };
}

/**
 * Valida o tenant e devolve a query base. O service-role bypassa RLS — este
 * `.eq("tenant_id", ...)` é a única proteção real contra vazamento
 * cross-tenant (ver "Isolamento multi-tenant" no CLAUDE.md do projeto).
 * Tenant vazio lança antes de qualquer query rodar sem filtro.
 */
export function montarQueryComunidades(tenantId: string): { tenantId: string } {
  if (!tenantId) throw new Error("tenantId é obrigatório para consultar comunidades");
  return { tenantId };
}

export async function listarComunidades(tenantId: string): Promise<Comunidade[]> {
  const { tenantId: tid } = montarQueryComunidades(tenantId);
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(ROW_FIELDS)
    .eq("tenant_id", tid)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ComunidadeRow[]).map(mapRow);
}

/**
 * Comunidade É campanha: nasce com o mesmo invariante de `POST /api/campanhas`
 * — slug livre GLOBALMENTE (é o `/r/<slug>` do link mestre) e a linha em
 * `tracked_links`. Sem isso a comunidade aparece em /painel/campanhas com link
 * morto, ou com o QR apontando pro link de outro tenant.
 *
 * Devolve `null` quando o link mestre não pôde ser criado (corrida de slug); a
 * linha de `campaign_groups` já foi desfeita nesse caso.
 *
 * `userId` é só pra atribuir o marco de ativação (`first_campaign_created`) a
 * quem criou — passar `null` quando não houver usuário logado no contexto.
 * Comunidade e campanha são a mesma tabela, então o marco dispara em qualquer
 * uma que nascer primeiro: sem isso, um tenant que só cria comunidades nunca
 * ativava no funil (POST /api/campanhas era o único caminho que disparava).
 */
export async function criarComunidade(
  tenantId: string,
  dados: { nome: string },
  userId: string | null = null,
): Promise<Comunidade | null> {
  const { tenantId: tid } = montarQueryComunidades(tenantId);
  const existentes = await listarComunidades(tid);
  const slug = await uniqueMasterSlug(dados.nome, new Set(existentes.map((c) => c.slug)), "comunidade");

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      tenant_id: tid,
      name: dados.nome,
      slug,
      group_ids: [],
      auto_grow: false,
      whatsapp_community_jid: null,
    })
    .select(ROW_FIELDS)
    .single();
  if (error) throw new Error(error.message);

  const comunidade = mapRow(data as ComunidadeRow);
  const temLink = await criarLinkMestreOuDesfazer(tid, { id: comunidade.id, slug: comunidade.slug, name: comunidade.nome });
  if (!temLink) return null;

  if (existentes.length === 0) {
    void trackFunnelEvent({ tenantId: tid, userId, event: "first_campaign_created", onlyFirst: true, metadata: { campaignId: comunidade.id, via: "comunidade" } });
  }

  return comunidade;
}

async function buscarIdPorSlug(tenantId: string, slug: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Comunidade "${slug}" não encontrada`);
  return data.id as string;
}

/**
 * Vincula/desvincula sem ler o array primeiro: `campaign_group_append_group_id`
 * e `campaign_group_remove_group_id` fazem o append/remove num UPDATE só,
 * atômico por linha no Postgres. Ler `group_ids`, alterar em JS e regravar o
 * array inteiro (o que este store fazia antes) perde escrita quando a tela e
 * o auto-grow do worker mexem na mesma coleção ao mesmo tempo — clássico lost
 * update. Requer a migração `20260916040000_campaign_group_ids_rpc.sql`
 * aplicada nos dois bancos.
 */
export async function vincularGrupo(tenantId: string, slug: string, whatsappGroupId: string): Promise<void> {
  const { tenantId: tid } = montarQueryComunidades(tenantId);
  const id = await buscarIdPorSlug(tid, slug);
  const { error } = await getSupabaseAdmin().rpc("campaign_group_append_group_id", {
    p_tenant_id: tid,
    p_id: id,
    p_whatsapp_group_id: whatsappGroupId,
  });
  if (error) throw new Error(error.message);
}

export async function desvincularGrupo(tenantId: string, slug: string, whatsappGroupId: string): Promise<void> {
  const { tenantId: tid } = montarQueryComunidades(tenantId);
  const id = await buscarIdPorSlug(tid, slug);
  const { error } = await getSupabaseAdmin().rpc("campaign_group_remove_group_id", {
    p_tenant_id: tid,
    p_id: id,
    p_whatsapp_group_id: whatsappGroupId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Espelha em `campaign_groups` cada comunidade nativa que o tenant administra.
 *
 * A gaveta espelho é um retrato do WhatsApp, não uma coleção editável: quem
 * manda é `linkedParent`, e o próximo sync sobrescreve `group_ids`. Por isso a
 * tela desabilita vincular/desvincular quando `whatsapp_community_jid` existe
 * (spec §3.4) — desvincular aqui não desvincularia lá.
 */
export async function espelharComunidadesNativas(tenantId: string): Promise<number> {
  const { tenantId: tid } = montarQueryComunidades(tenantId);

  const { data: linhas, error: erroGrupos } = await getSupabaseAdmin()
    .from("groups")
    .select("whatsapp_group_id, name, is_admin, community_jid, community_role")
    .eq("tenant_id", tid)
    .not("community_jid", "is", null);
  if (erroGrupos) throw new Error(erroGrupos.message);

  const nativas = comunidadesNativas(
    (linhas ?? []).map((l) => ({
      whatsappGroupId: l.whatsapp_group_id as string,
      nome: (l.name as string) ?? "",
      isAdmin: Boolean(l.is_admin),
      communityJid: l.community_jid as string | null,
      communityRole: l.community_role as PapelComunidade | null,
    })),
  );
  if (nativas.length === 0) return 0;

  const { data: existentes, error: erroGavetas } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id, slug, whatsapp_community_jid")
    .eq("tenant_id", tid)
    .not("whatsapp_community_jid", "is", null);
  if (erroGavetas) throw new Error(erroGavetas.message);

  const porJid = new Map<string, { id: string }>();
  for (const g of existentes ?? []) {
    porJid.set(g.whatsapp_community_jid as string, { id: g.id as string });
  }

  // Uma leitura só, antes do laço: cada slug que este laço cria entra no
  // mesmo Set, então uma comunidade nova nunca colide com a que acabou de
  // nascer duas iterações atrás. Consultar `listarComunidades` a cada volta
  // seria uma query por comunidade sem ganho nenhum.
  const slugsEmUso = new Set((await listarComunidades(tid)).map((c) => c.slug));

  let tocadas = 0;
  for (const nativa of nativas) {
    const ja = porJid.get(nativa.communityJid);
    if (ja) {
      const { error } = await getSupabaseAdmin()
        .from(TABLE)
        .update({ name: nativa.nome, group_ids: nativa.memberGroupIds })
        .eq("tenant_id", tid)
        .eq("id", ja.id);
      if (error) throw new Error(error.message);
    } else {
      // Assinatura: uniqueMasterSlug(name, takenInTenant, fallback) — mesma
      // ordem que `criarComunidade` usa logo acima neste arquivo.
      const slug = await uniqueMasterSlug(nativa.nome, slugsEmUso, "comunidade");
      slugsEmUso.add(slug);

      const { data, error } = await getSupabaseAdmin()
        .from(TABLE)
        .insert({
          tenant_id: tid,
          name: nativa.nome,
          slug,
          group_ids: nativa.memberGroupIds,
          // `auto_grow: false` não é detalhe: o worker do auto-grow escreve em
          // `group_ids` pela RPC atômica, e esta função regrava o array
          // inteiro. Espelho do WhatsApp e auto-grow na mesma linha seriam
          // lost update garantido.
          auto_grow: false,
          whatsapp_community_jid: nativa.communityJid,
        })
        .select(ROW_FIELDS)
        .single();
      if (error) throw new Error(error.message);

      // Sem link mestre a rota /c/[slug] da Fase 5 não resolve esta coleção.
      // `criarLinkMestreOuDesfazer` já desfaz a linha em `campaign_groups`
      // quando o link falha (corrida de slug) — mesmo padrão de
      // `criarComunidade` logo acima. Sem checar o retorno, esta função
      // contaria como "tocada" uma gaveta que não existe mais no banco.
      const criada = mapRow(data as ComunidadeRow);
      const temLink = await criarLinkMestreOuDesfazer(tid, {
        id: criada.id,
        slug: criada.slug,
        name: criada.nome,
      });
      if (!temLink) {
        // A linha foi apagada por dentro, então o slug nunca chegou a
        // existir de verdade — tira do Set para não recusar à toa um slug
        // livre para a próxima comunidade nesta mesma chamada.
        slugsEmUso.delete(slug);
        continue;
      }
    }
    tocadas += 1;
  }
  return tocadas;
}
