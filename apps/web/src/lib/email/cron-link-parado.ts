import "server-only";
import { sendEmail } from "@/lib/email/send";
import { linkParadoEmail } from "@/lib/email/templates";
import { JANELA_DE_CLIQUE_MS, TIPO_LINK_PARADO, linkParadoDaCampanha, type LinkParado } from "@/lib/email/link-parado-aviso";
import { listCampaignGroupStates } from "@/lib/stores/campaign-group-states";
import { listCampaignGroups } from "@/lib/stores/campaign-groups";
import type { getSupabaseAdmin } from "@/lib/supabase/server";

type Supabase = ReturnType<typeof getSupabaseAdmin>;
type Leitura = { data: unknown[] | null; error: { message: string } | null };

export type ContextoDoJob = {
  supabase: Supabase;
  appUrl: string;
  now: Date;
  /** Corte do "1 por dia" (o mesmo dos Jobs 3 e 5). */
  todayStartISO: string;
  temPlanoValendo: (tenantId: string) => Promise<boolean>;
  /** O `liberado` do cron: erro de leitura conta erro e não envia. */
  liberado: (job: string, tenantId: string, leitura: Leitura) => boolean;
};

/**
 * Campanhas da loja cujo link teve clique desde `desde` e, pelo estado de agora,
 * não manda ninguém para grupo. Um `limit(1)` por campanha em vez de uma leitura
 * da loja toda: com o teto de 1000 linhas do PostgREST, a campanha que mais clica
 * cortaria as outras da resposta. Erro em qualquer leitura lança.
 */
async function linksParadosDaLoja(supabase: Supabase, tenantId: string, desde: string, now: Date): Promise<LinkParado[]> {
  const parados: LinkParado[] = [];
  for (const campanha of await listCampaignGroups(tenantId)) {
    const { data, error } = await supabase
      .from("link_click_events")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("campaign_group_id", campanha.id)
      .gte("occurred_at", desde)
      .limit(1);
    if (error) throw new Error(error.message);
    if (!data?.length) continue;
    const parado = linkParadoDaCampanha(campanha, await listCampaignGroupStates(tenantId, campanha.id), now);
    if (parado) parados.push(parado);
  }
  return parados;
}

/**
 * Job 8 do cron de e-mails: link de campanha em uso que parou de mandar gente para
 * grupo. Um e-mail por loja com todas as campanhas pendentes; uma notificação por
 * campanha, que é o dedupe (no máximo 1 aviso por campanha por dia).
 *
 * Sem opt-out próprio: nenhum dos três avisos de Configurações fala de link, e
 * pendurar este num deles desligaria o aviso errado.
 */
export async function avisarLinksParados(ctx: ContextoDoJob): Promise<{ enviados: number; erros: number }> {
  const { supabase } = ctx;
  let enviados = 0;
  let erros = 0;
  const desde = new Date(ctx.now.getTime() - JANELA_DE_CLIQUE_MS).toISOString();

  const { data: orgs, error: orgsError } = await supabase.from("organizations").select("id, name");
  if (orgsError) {
    console.error("[cron] link_parado: falha lendo organizations:", orgsError.message);
    return { enviados, erros: 1 };
  }

  for (const org of orgs ?? []) {
    if (!(await ctx.temPlanoValendo(org.id))) continue;

    let parados: LinkParado[];
    try {
      parados = await linksParadosDaLoja(supabase, org.id, desde, ctx.now);
    } catch (e) {
      console.error(`[cron] link_parado: falha lendo campanhas de ${org.id}:`, (e as Error).message);
      erros++;
      continue;
    }

    const pendentes: LinkParado[] = [];
    for (const parado of parados) {
      const avisado = await supabase
        .from("notifications")
        .select("id")
        .eq("tenant_id", org.id)
        .eq("type", TIPO_LINK_PARADO)
        .eq("href", parado.href)
        .gte("created_at", ctx.todayStartISO)
        .limit(1);
      if (ctx.liberado(TIPO_LINK_PARADO, org.id, avisado)) pendentes.push(parado);
    }
    if (pendentes.length === 0) continue;

    const { data: owner } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", org.id)
      .eq("role", "owner")
      .maybeSingle();
    if (!owner) continue;

    const { data: userData } = await supabase.auth.admin.getUserById(owner.user_id);
    const email = userData.user?.email;
    const name = userData.user?.user_metadata?.name || "lojista";
    if (!email) continue;

    const tpl = linkParadoEmail(name, ctx.appUrl, pendentes);
    const sent = await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, tenantId: org.id, kind: "link_parado" });
    if (!sent) {
      erros++;
      continue;
    }
    enviados++;

    // Se o registro falhar o e-mail já foi, e a próxima rodada reenviaria: conta erro.
    const { error: notifError } = await supabase.from("notifications").insert(
      pendentes.map((p) => ({
        tenant_id: org.id,
        user_id: owner.user_id,
        type: TIPO_LINK_PARADO,
        title: `O link da campanha "${p.nome}" não está mandando ninguém para grupo`,
        body: p.texto,
        href: p.href,
      })),
    );
    if (notifError) {
      console.error(`[cron] link_parado: enviado para ${org.id} mas notification não registrada:`, notifError.message);
      erros++;
    }
  }

  return { enviados, erros };
}
