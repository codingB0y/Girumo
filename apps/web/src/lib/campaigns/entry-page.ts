/**
 * HTML das telas públicas do /r/: a de ENTRADA (intersticial de 600 ms que
 * dispara o pixel, tenta o deep link e cai no link https) e a de LOTADO/AVISO.
 *
 * Montado por concatenação, sem React, de propósito: é a única superfície
 * pública sem pré-render, e a CSP dela é por nonce — cada <script> abaixo tem
 * de carregar o atributo, senão a página morre em silêncio.
 *
 * Puro (sem `server-only`), para o `tsx --test` cobrir o HTML.
 */
import { nonceAttribute } from "@/lib/security/csp";
import type { LotadoDestino } from "@/lib/campaigns/settings";
import type { BlockedReason } from "@/lib/links/resolve-click-target";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Motivos que significam "não coube" — só eles levam ao destino de lotado. */
export const LOTADO_REASONS: ReadonlySet<BlockedReason> = new Set<BlockedReason>(["all-full", "cap-reached", "closed"]);

/**
 * Para onde mandar quem não coube. `null` = mostrar a tela de aviso. Campanha
 * NÃO configurada (sem convite, sem admin, pool vazio) nunca redireciona:
 * mostrar lista de espera ali esconderia do lojista o que ele precisa arrumar.
 */
export function lotadoRedirect(reason: BlockedReason, lotado: LotadoDestino, origin: string): string | null {
  if (!LOTADO_REASONS.has(reason)) return null;
  if (lotado.modo === "pagina") return `${origin}/p/${lotado.pagina_slug}`;
  if (lotado.modo === "url") return lotado.url;
  return null;
}

const STYLE = `body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F4F0E7;color:#071923;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
.card{width:100%;max-width:420px;background:#FFFEFA;border:1px solid rgba(7,25,35,.08);border-radius:20px;padding:28px 24px;box-shadow:0 18px 40px -30px rgba(7,25,35,.35)}
.loja{font:500 11px/1.4 ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:#52646C}
h1{font-size:26px;line-height:1.1;letter-spacing:-.02em;margin:10px 0 8px}
p{margin:0;color:#52646C;font-size:15px;line-height:1.5}
.linha{height:3px;border-radius:3px;background:#E4E0D6;overflow:hidden;margin:18px 0}
.linha i{display:block;height:100%;width:0;background:#2E66FF;border-radius:3px;animation:enche .6s ease-out forwards}
@keyframes enche{to{width:100%}}
.btn{display:flex;align-items:center;justify-content:center;padding:14px 16px;border-radius:14px;background:#25D366;color:#052E16;font-weight:700;font-size:16px;text-decoration:none}
.dica{margin-top:10px;text-align:center;font-size:12px;color:#52646C}
.rodape{margin-top:22px;display:flex;justify-content:space-between;font:500 10px/1 ui-monospace,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:#8A979D}
@media (prefers-reduced-motion:reduce){.linha i{animation:none;width:100%}}`;

/**
 * `eventID` liga este disparo ao evento que o servidor manda pelo CAPI. Sem ele
 * a Meta conta dois Leads pelo mesmo clique e o CPL da campanha vira ficção.
 */
function pixelScript(pixelId: string, evento: string, eventId: string | undefined, nonceAttr: string): string {
  const opts = eventId ? `,{},{eventID:${JSON.stringify(eventId)}}` : "";
  return `<script${nonceAttr}>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init',${JSON.stringify(pixelId)});fbq('track','PageView');fbq('track',${JSON.stringify(evento)}${opts});</script>`;
}

/**
 * Um único gtag.js serve GA4 e Google Ads. O `id=` da tag carrega o primeiro
 * que existir; os `config` abaixo é que ligam cada um. Google Ads sem rótulo
 * não dispara nada: sem `send_to` não há conversão para atribuir.
 */
function gtagScript(ga4Id: string, ads: { id: string; label: string } | undefined, nonceAttr: string): string {
  const temAds = Boolean(ads?.id && ads.label);
  const tagId = ga4Id || (temAds ? ads!.id : "");
  if (!tagId) return "";
  const linhas = [`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());`];
  if (ga4Id) linhas.push(`gtag('config',${JSON.stringify(ga4Id)});gtag('event','generate_lead');`);
  if (temAds) {
    linhas.push(
      `gtag('config',${JSON.stringify(ads!.id)});gtag('event','conversion',{send_to:${JSON.stringify(`${ads!.id}/${ads!.label}`)}});`,
    );
  }
  return `<script${nonceAttr} async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}"></script>
<script${nonceAttr}>${linhas.join("")}</script>`;
}

export function renderEntryPage(i: {
  loja: string;
  campaignName: string;
  groupName: string | null;
  httpsUrl: string;
  deepLinkUrl: string | null;
  nonce: string | null;
  pixelId?: string;
  evento?: string;
  eventId?: string;
  ga4Id?: string;
  googleAds?: { id: string; label: string };
  /** Painel: mesma tela, zero script — ver comentário abaixo. */
  preview?: boolean;
}): string {
  const nonceAttr = nonceAttribute(i.nonce);
  const href = escapeHtml(i.deepLinkUrl ?? i.httpsUrl);
  const frase = i.groupName
    ? `Você vai entrar no grupo <b>${escapeHtml(i.groupName)}</b>.`
    : `Você vai entrar num grupo de <b>${escapeHtml(i.campaignName)}</b>.`;
  // Prévia do painel: a MESMA tela, sem nada que dispare evento ou navegue. Um
  // <iframe srcdoc> não herda a CSP desta página, então "sem nonce" não bastaria
  // para segurar os scripts — eles têm de não existir no HTML.
  const head = i.preview
    ? ""
    : `${i.pixelId ? pixelScript(i.pixelId, i.evento ?? "Lead", i.eventId, nonceAttr) : ""}${gtagScript(i.ga4Id ?? "", i.googleAds, nonceAttr)}`;
  // JSON.stringify: as URLs viram literais JS seguros (escapa aspas, barras e <).
  const nav = i.preview
    ? ""
    : `<script${nonceAttr}>(function(){var https=${JSON.stringify(i.httpsUrl)};var deep=${JSON.stringify(i.deepLinkUrl)};
setTimeout(function(){if(deep){location.href=deep;setTimeout(function(){if(document.visibilityState==="visible")location.replace(https)},1200)}else{location.replace(https)}},600)})();</script>`;
  const noscript = i.preview
    ? ""
    : `<noscript><meta http-equiv="refresh" content="0;url=${escapeHtml(i.httpsUrl)}"></noscript>`;
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Abrindo o WhatsApp…</title>
<style>${STYLE}</style>${head}</head>
<body><div class="card"><div class="loja">${escapeHtml(i.loja)}</div><h1>Abrindo o WhatsApp…</h1><p>${frase}</p>
<div class="linha"><i></i></div><a class="btn" id="abrir" href="${href}">Abrir WhatsApp</a><p class="dica">Não abriu? Toque no botão.</p>
<div class="rodape"><span>girumo</span><span>chat.whatsapp.com</span></div></div>
${nav}${noscript}</body></html>`;
}

/** Aviso (lotado, encerrada, não configurada) — 200 para o visitante ler, não um erro. */
export function renderBlockedPage(i: { loja: string; title: string; message: string }): string {
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(i.title)}</title>
<style>${STYLE}</style></head>
<body><div class="card">${i.loja ? `<div class="loja">${escapeHtml(i.loja)}</div>` : ""}<h1>${escapeHtml(i.title)}</h1><p>${escapeHtml(i.message)}</p>
<div class="rodape"><span>girumo</span><span></span></div></div></body></html>`;
}
