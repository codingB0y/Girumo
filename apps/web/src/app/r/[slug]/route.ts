import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as linksStore from "@/lib/stores/tracked-links";
import * as campaignsStore from "@/lib/stores/campaign-groups";
import * as groupsStore from "@/lib/stores/groups";
import { resolveClickTarget, type BlockedReason } from "@/lib/links/resolve-click-target";
import { getLink, recordClick, clickCounts, type ClickEvent } from "@/lib/store";
import { findCampanhaBySlug } from "@/lib/campanhas-store";
import { listGroups as listLegacyGroups, nextAvailableGroup as legacyNextGroup } from "@/lib/groups-store";
import { ENTRADA_DEFAULTS, readEntrada } from "@/lib/campaigns/settings";
import { lotadoRedirect, renderBlockedPage, renderEntryPage } from "@/lib/campaigns/entry-page";
import { isMobileUa, readCookie, rememberCookieHeader, rememberCookieName, whatsappDeepLink } from "@/lib/links/deep-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Crawlers/previews que NÃO são cliques humanos (não inflam o funil/CPL).
const BOT_UA =
  /bot|crawler|spider|facebookexternalhit|facebookcatalog|whatsapp|telegram|slurp|bingpreview|preview|curl|wget|python-requests|axios|headless|monitor|pingdom|uptime/i;

// Mensagem por motivo de bloqueio. "Sem convite"/"sem grupo" NÃO podem dizer
// "cheio": o grupo pode estar vazio e só faltar configuração no painel — mentir
// pro visitante esconde justamente o que o lojista precisa arrumar.
const BLOCKED_MESSAGE: Record<BlockedReason, string> = {
  "cap-reached": "Este grupo já está cheio. Em breve abriremos um novo lote. 💛",
  "all-full": "Todos os grupos desta campanha estão cheios. Em breve abriremos um novo. 💛",
  "no-invite": "Esta campanha ainda não está aberta. Volte daqui a pouco. 💛",
  "no-admin": "Esta campanha ainda não está aberta. Volte daqui a pouco. 💛",
  "empty-pool": "Esta campanha ainda não está aberta. Volte daqui a pouco. 💛",
  closed: "Esta campanha já encerrou. Fique de olho: em breve tem novidade. 💛",
};

// GET /r/:slug — redireciona um clique para um grupo. Dois tipos de link:
//  1) link MESTRE de campanha (`campaign_group_id` preenchido) → grupo lembrado
//     pelo cookie ou próximo grupo DISPONÍVEL do pool ("lota sozinho"), obedecendo
//     às configurações de entrada da campanha (deep link, encerramento, lotado).
//  2) link comum → destino fixo, respeitando clickCap ("grupo cheio").
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ua = req.headers.get("user-agent") ?? "";
  // Só conta clique de gente real — bot/preview/crawler redireciona mas não conta.
  const human = !BOT_UA.test(ua);

  if (!USE_SUPABASE) return legacyGet(req, slug, ua, human);

  const link = await linksStore.getTrackedLinkBySlug(slug);
  if (!link) return notFoundPage();

  // Daqui pra baixo o tenant sai da PRÓPRIA linha do link: toda query seguinte
  // filtra por ele (service-role bypassa RLS — o filtro é que isola o tenant).
  const [campaign, groups] = link.campaign_group_id
    ? await Promise.all([
        campaignsStore.getCampaignGroupById(link.tenant_id, link.campaign_group_id),
        groupsStore.listGroups(link.tenant_id),
      ])
    : [null, []];

  const entrada = campaign ? readEntrada(campaign.metadata) : ENTRADA_DEFAULTS;
  const loja = campaign ? String(campaign.metadata?.loja ?? "") : "";
  const cookieName = campaign ? rememberCookieName(campaign.id) : null;
  const rememberedGroupId = cookieName ? readCookie(req.headers.get("cookie"), cookieName) : null;
  const reqUrl = new URL(req.url);

  const target = resolveClickTarget({ link, campaign, groups, entrada, rememberedGroupId });
  if (target.kind === "blocked") {
    // Lotado/encerrada pode ir para a lista de espera; campanha não configurada
    // mostra a mensagem honesta (ver lotadoRedirect).
    const destino = lotadoRedirect(target.reason, entrada.lotado, reqUrl.origin);
    if (destino) return Response.redirect(destino, 302);
    return html(renderBlockedPage({ loja, title: "Grupo cheio", message: BLOCKED_MESSAGE[target.reason] }), 200);
  }

  if (human) {
    // Duas gravações independentes: o contador (total) e o evento com data
    // (histórico). `allSettled` porque uma falhar não pode cancelar a outra —
    // e nenhuma das duas é caminho crítico: métrica nunca segura o visitante.
    await Promise.allSettled([
      linksStore.incrementTrackedLinkClicks(link.id),
      linksStore.recordTrackedLinkClick(link),
    ]);
  }

  const headers = new Headers();
  // Grupo lembrado: só gente real, só campanha, só quando a opção está ligada.
  if (human && cookieName && target.groupId && entrada.um_grupo_por_pessoa) {
    headers.append("set-cookie", rememberCookieHeader(cookieName, target.groupId, slug, reqUrl.protocol === "https:"));
  }

  const deepLinkUrl = campaign && entrada.deep_link && isMobileUa(ua) ? whatsappDeepLink(target.url) : null;
  if (target.pixelId || deepLinkUrl) {
    // Tela de entrada: dispara o pixel e/ou tenta o app. Nonce da CSP desta
    // request, posto pelo middleware — sem ele os scripts inline morrem.
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(
      renderEntryPage({
        loja,
        campaignName: campaign?.name ?? "",
        groupName: target.groupName ?? null,
        httpsUrl: target.url,
        deepLinkUrl,
        nonce: req.headers.get("x-nonce"),
        pixelId: target.pixelId,
      }),
      { headers },
    );
  }
  headers.set("location", target.url);
  return new Response(null, { status: 302, headers });
}

/**
 * Caminho JSON legado (HUBFLOW_USE_SUPABASE=0, só emergência/dev local).
 * Mantido intacto de propósito — some junto com os stores de arquivo. As
 * configurações de entrada não existem aqui.
 */
async function legacyGet(req: Request, slug: string, ua: string, human: boolean): Promise<Response> {
  const url = new URL(req.url);
  const click = (target?: string): ClickEvent => ({
    slug,
    ts: new Date().toISOString(),
    utmSource: url.searchParams.get("utm_source") ?? undefined,
    utmCampaign: url.searchParams.get("utm_campaign") ?? undefined,
    ref: req.headers.get("referer") ?? undefined,
    ua,
    target,
  });

  const link = await getLink(slug);
  if (link) {
    if (link.clickCap) {
      const counts = await clickCounts();
      if ((counts[slug] ?? 0) >= link.clickCap) {
        return fullPage(BLOCKED_MESSAGE["cap-reached"]);
      }
    }
    if (human) await recordClick(click());
    if (link.pixelId && /^\d{5,20}$/.test(link.pixelId)) {
      return html(
        renderEntryPage({
          loja: "",
          campaignName: "",
          groupName: null,
          httpsUrl: link.destinationUrl,
          deepLinkUrl: null,
          nonce: req.headers.get("x-nonce"),
          pixelId: link.pixelId,
        }),
        200,
      );
    }
    return Response.redirect(link.destinationUrl, 302);
  }

  const campanha = await findCampanhaBySlug(slug);
  if (campanha) {
    if (!campanha.tenantId) return notFoundPage();
    const groups = await listLegacyGroups(campanha.tenantId);
    const target = legacyNextGroup(campanha.groupIds, groups);
    if (!target) return fullPage(BLOCKED_MESSAGE["all-full"]);
    if (human) await recordClick(click(target.whatsappGroupId));
    return Response.redirect(target.inviteUrl!, 302);
  }

  return notFoundPage();
}

function html(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

/** 404 amigável — quem clicou é cliente da loja, não deve ver erro cru. */
function notFoundPage(): Response {
  return html(renderBlockedPage({ loja: "", title: "Link não encontrado", message: "Este link não existe ou foi desativado." }), 404);
}

/** Página amigável de "grupo cheio" (200 p/ o visitante ver a mensagem, não um erro). */
function fullPage(message: string): Response {
  return html(renderBlockedPage({ loja: "", title: "Grupo cheio", message }), 200);
}
