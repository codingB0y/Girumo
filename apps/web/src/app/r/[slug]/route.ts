import { getLink, recordClick, clickCounts, type ClickEvent } from "@/lib/store";
import { findCampanhaBySlug } from "@/lib/campanhas-store";
import { listGroups, nextAvailableGroup } from "@/lib/groups-store";
import { nonceAttribute } from "@/lib/security/csp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Crawlers/previews que NÃO são cliques humanos (não inflam o funil/CPL).
const BOT_UA =
  /bot|crawler|spider|facebookexternalhit|facebookcatalog|whatsapp|telegram|slurp|bingpreview|preview|curl|wget|python-requests|axios|headless|monitor|pingdom|uptime/i;

// GET /r/:slug — redireciona um clique para um grupo. Dois modos:
//  1) slug de LINK rastreado → destino fixo (respeitando clickCap = "grupo cheio").
//  2) slug de CAMPANHA (link mestre) → próximo grupo DISPONÍVEL do pool ("lota sozinho").
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ua = req.headers.get("user-agent") ?? "";
  const human = !BOT_UA.test(ua);
  const url = new URL(req.url);

  // Só conta clique de gente real — bot/preview/crawler redireciona mas não conta.
  const click = (target?: string): ClickEvent => ({
    slug,
    ts: new Date().toISOString(),
    utmSource: url.searchParams.get("utm_source") ?? undefined,
    utmCampaign: url.searchParams.get("utm_campaign") ?? undefined,
    ref: req.headers.get("referer") ?? undefined,
    ua,
    target,
  });

  // 1) Link rastreado (destino fixo).
  const link = await getLink(slug);
  if (link) {
    // Cap de cliques atingido → grupo "cheio": para de redirecionar.
    if (link.clickCap) {
      const counts = await clickCounts();
      if ((counts[slug] ?? 0) >= link.clickCap) {
        return fullPage("Este grupo já está cheio. Em breve abriremos um novo lote. 💛");
      }
    }
    if (human) await recordClick(click());

    // Com Pixel do Facebook: intersticial que dispara "Lead" e só então redireciona.
    if (link.pixelId && /^\d{5,20}$/.test(link.pixelId)) {
      // Nonce da CSP desta request, posto pelo middleware. Sem ele os dois
      // scripts inline abaixo seriam bloqueados e o clique nunca converteria.
      const nonce = req.headers.get("x-nonce");
      return new Response(pixelInterstitial(link.pixelId, link.destinationUrl, nonce), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return Response.redirect(link.destinationUrl, 302);
  }

  // 2) Link mestre de campanha → próximo grupo disponível (preenchimento sequencial).
  const campanha = await findCampanhaBySlug(slug);
  if (campanha) {
    if (!campanha.tenantId) {
      return new Response("Campanha sem tenant associado.", { status: 404 });
    }
    const groups = await listGroups(campanha.tenantId);
    const target = nextAvailableGroup(campanha.groupIds, groups);
    if (!target) {
      return fullPage("Todos os grupos desta campanha estão cheios. Em breve abriremos um novo. 💛");
    }
    if (human) await recordClick(click(target.whatsappGroupId));
    return Response.redirect(target.inviteUrl!, 302);
  }

  return new Response("Link não encontrado.", { status: 404 });
}

// Página amigável de "grupo cheio" (200 p/ o visitante ver a mensagem, não um erro).
function fullPage(message: string): Response {
  const safe = message.replace(/</g, "&lt;");
  return new Response(
    `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Grupo cheio</title>
<style>body{font-family:system-ui,Arial;background:#faf7ff;color:#2a2140;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.card{max-width:420px;text-align:center;background:#fff;border:1px solid #e7defb;border-radius:16px;padding:32px}</style>
</head><body><div class="card"><p style="font-size:18px;font-weight:600">${safe}</p></div></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
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
