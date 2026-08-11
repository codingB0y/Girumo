import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as linksStore from "@/lib/stores/tracked-links";
import * as campaignsStore from "@/lib/stores/campaign-groups";
import * as groupsStore from "@/lib/stores/groups";
import { resolveClickTarget, type BlockedReason } from "@/lib/links/resolve-click-target";
import { getLink, recordClick, clickCounts, type ClickEvent } from "@/lib/store";
import { findCampanhaBySlug } from "@/lib/campanhas-store";
import { listGroups as listLegacyGroups, nextAvailableGroup as legacyNextGroup } from "@/lib/groups-store";
import { nonceAttribute } from "@/lib/security/csp";

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
  "empty-pool": "Esta campanha ainda não está aberta. Volte daqui a pouco. 💛",
};

// GET /r/:slug — redireciona um clique para um grupo. Dois tipos de link:
//  1) link MESTRE de campanha (`campaign_group_id` preenchido) → próximo grupo
//     DISPONÍVEL do pool ("lota sozinho").
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

  const target = resolveClickTarget({ link, campaign, groups });
  if (target.kind === "blocked") return fullPage(BLOCKED_MESSAGE[target.reason]);

  if (human) {
    try {
      await linksStore.incrementTrackedLinkClicks(link.id);
    } catch {
      // Contador é métrica, não caminho crítico: nunca segura o visitante.
    }
  }

  // Com Pixel do Facebook: intersticial que dispara "Lead" e só então redireciona.
  if (target.pixelId) {
    // Nonce da CSP desta request, posto pelo middleware. Sem ele os dois
    // scripts inline abaixo seriam bloqueados e o clique nunca converteria.
    const nonce = req.headers.get("x-nonce");
    return new Response(pixelInterstitial(target.pixelId, target.url, nonce), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return Response.redirect(target.url, 302);
}

/**
 * Caminho JSON legado (HUBFLOW_USE_SUPABASE=0, só emergência/dev local).
 * Mantido intacto de propósito — some junto com os stores de arquivo.
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
      const nonce = req.headers.get("x-nonce");
      return new Response(pixelInterstitial(link.pixelId, link.destinationUrl, nonce), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
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

/** 404 amigável — quem clicou é cliente da loja, não deve ver erro cru. */
function notFoundPage(): Response {
  return page("Este link não existe ou foi desativado.", 404, "Link não encontrado");
}

/** Página amigável de "grupo cheio" (200 p/ o visitante ver a mensagem, não um erro). */
function fullPage(message: string): Response {
  return page(message, 200, "Grupo cheio");
}

function page(message: string, status: number, title: string): Response {
  const safe = message.replace(/</g, "&lt;");
  return new Response(
    `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,Arial;background:#faf7ff;color:#2a2140;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.card{max-width:420px;text-align:center;background:#fff;border:1px solid #e7defb;border-radius:16px;padding:32px}</style>
</head><body><div class="card"><p style="font-size:18px;font-weight:600">${safe}</p></div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function pixelInterstitial(pixelId: string, dest: string, nonce: string | null): string {
  const safeDest = dest.replace(/"/g, "%22").replace(/</g, "%3C");
  // base64 do nonce não tem aspas nem `<`, então cabe cru no atributo. Sem nonce
  // (middleware não rodou) também não há CSP nesta rota — o atributo some.
  const nonceAttr = nonceAttribute(nonce);
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrando no grupo…</title>
<script${nonceAttr}>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');fbq('track','PageView');fbq('track','Lead');</script>
<style>body{font-family:system-ui,Arial;background:#0f0a1f;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}</style>
</head><body><div style="text-align:center"><p style="font-size:18px;font-weight:600">Entrando no grupo VIP…</p><p style="opacity:.6">aguarde um instante</p></div>
<script${nonceAttr}>setTimeout(function(){location.replace("${safeDest}")},700);</script>
<noscript><meta http-equiv="refresh" content="0;url=${safeDest}"></noscript></body></html>`;
}
