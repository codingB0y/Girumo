/**
 * O JS inline da página do link da bio, devolvido sem a tag (o `index.ts` o
 * embrulha em `<script nonce>`). Nenhum texto do lojista entra aqui: o script
 * só lê `data-*` que o renderizador emite (uuid da página e do link, tipo de
 * lista fechada, CNPJ sem pontuação, só [0-9A-Z]) e, com rastreio, os dois ids que passam nas
 * regras abaixo. PR 3a: "Abrindo…", balanço do toque e "Copiado"; PR 4b: o
 * beacon do toque; PR 7: Pixel da Meta (PageView, Contact, BioToque) e GA4
 * (page_view, bio_toque) — nunca Lead, que é do /r/ (spec §4, §14.8).
 */

/** As regras do §4 de novo: o documento já passou pelo zod no salvar, mas só id que passa AQUI entra no JS (spec §10). */
const ID_PIXEL = /^\d{5,20}$/;
const ID_GA4 = /^G-[A-Z0-9]{4,}$/;

/** O snippet oficial do Pixel, o mesmo do /r/ (`entry-page.ts`) e das LPs, com o `d` (document) da página. */
const SNIPPET_DO_PIXEL =
  "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,d,'script','https://connect.facebook.net/en_US/fbevents.js');";

/** Ao abrir: Pixel (PageView) e GA4 (o `config` manda o page_view). Cada um no seu try: um não derruba o outro nem a página. */
function aoAbrir(pixel: string, ga4: string): string {
  const meta = pixel
    ? `try{${SNIPPET_DO_PIXEL}window.fbq("init",${JSON.stringify(pixel)});window.fbq("track","PageView")}catch(x){}`
    : "";
  const google = ga4
    ? `try{var w=window,gt=function(){w.dataLayer.push(arguments)};w.dataLayer=w.dataLayer||[];gt("js",new Date());gt("config",${JSON.stringify(ga4)});var g=d.createElement("script");g.async=!0;g.src=${JSON.stringify(`https://www.googletagmanager.com/gtag/js?id=${ga4}`)};d.head.appendChild(g)}catch(x){}`
    : "";
  return meta || google ? `;${meta}${google}` : "";
}

/**
 * No toque de um botão (`k` = data-tipo): Contact no WhatsApp e BioToque nos outros; bio_toque no GA4.
 * Nunca Lead. O "Como chegar" só conta quando o <details> abre — a mesma regra do beacon do 4b (no clique
 * o `open` ainda é o de antes): se o 4b mudar a dele, mudar esta junto.
 */
function noToque(pixel: string, ga4: string): string {
  const meta = pixel
    ? 'try{if(k==="whatsapp")window.fbq("track","Contact");else window.fbq("trackCustom","BioToque",{botao:k})}catch(x){}'
    : "";
  const google = ga4 ? 'try{gt("event","bio_toque",{botao:k})}catch(x){}' : "";
  return meta || google ? `;if(k&&(a.tagName!=="SUMMARY"||!a.parentNode.open)){${meta}${google}}` : "";
}

/** `toque` e `fim` vazios = o JS de antes do PR 7, byte a byte (o JS é ES5 e sem "<": nunca fecha o <script>). */
function montar(toque: string, fim: string): string {
  return [
    "(function(){",
    'var d=document,s=d.getElementById("lk-status"),t=0,q=0,',
    'M={whatsapp:"Abrindo o WhatsApp…",grupo:"Abrindo o grupo…",link:"Abrindo…"};',
    'function diz(x){if(!s)return;s.textContent=x;clearTimeout(t);if(x)t=setTimeout(function(){s.textContent=""},3000)}',
    'd.addEventListener("click",function(e){',
    'var a=e.target&&e.target.closest?e.target.closest("[data-link],[data-copiar]"):null;if(!a)return;',
    'var c=a.getAttribute("data-copiar");',
    // Copiar CNPJ: `q` é o timer do "Copiado", um só (outro toque recomeça os 2,2 s); recusado ou sem a API, `f` avisa.
    'if(c!==null){var n=navigator.clipboard,f=function(){diz("Não foi possível copiar o CNPJ.")};',
    "if(n&&n.writeText)n.writeText(c).then(function(){",
    'a.textContent="Copiado";diz("CNPJ copiado.");clearTimeout(q);q=setTimeout(function(){a.textContent="Copiar CNPJ"},2200)},f);else f();return}',
    'a.classList.remove("lk-toque");void a.offsetWidth;a.classList.add("lk-toque");',
    'setTimeout(function(){a.classList.remove("lk-toque")},1600);',
    // Beacon (PR 4b). No clique o `open` do <details> ainda é o de antes: aberto = este toque fecha, não conta.
    // Sempre `navigator.sendBeacon(…)`: a função solta (`var b=navigator.sendBeacon`) dá "Illegal invocation".
    'var p=d.body.getAttribute("data-pagina");',
    'if(p&&navigator.sendBeacon&&(a.tagName!=="SUMMARY"||!a.parentNode.open))navigator.sendBeacon("/api/p/bio/toque",JSON.stringify({p:p,l:a.getAttribute("data-link")}));',
    'var k=a.getAttribute("data-tipo");if(k&&M.hasOwnProperty(k))diz(M[k])',
    toque, // PR 7: eventos do toque (vazio sem rastreio)
    "});",
    'addEventListener("pageshow",function(){diz("")})',
    fim, // PR 7: Pixel e GA4 ao abrir (vazio sem rastreio)
    "})();",
  ].join("");
}

export function scriptDaPagina(o: { rastreio: { metaPixelId: string; ga4Id: string } | null }): string {
  const r = o.rastreio;
  const pixel = r && ID_PIXEL.test(r.metaPixelId) ? r.metaPixelId : "";
  const ga4 = r && ID_GA4.test(r.ga4Id) ? r.ga4Id : "";
  return montar(noToque(pixel, ga4), aoAbrir(pixel, ga4));
}
