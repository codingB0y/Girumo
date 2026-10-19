/**
 * O JS inline da página do link da bio, devolvido sem a tag (o `index.ts` o
 * embrulha em `<script nonce>`). Nenhum texto do lojista entra aqui: o script
 * só lê `data-*` que o renderizador emite (uuid do link, tipo de lista fechada,
 * CNPJ sem pontuação, só [0-9A-Z]). PR 3a: "Abrindo…" no `#lk-status`, balanço do toque e
 * "Copiado". PR 4b acrescenta o sendBeacon no ramo do `[data-link]`; PR 7, o
 * Pixel e o GA4 a partir de `rastreio`.
 */
const JS = [
  "(function(){",
  'var d=document,s=d.getElementById("lk-status"),t=0,',
  'M={whatsapp:"Abrindo o WhatsApp…",grupo:"Abrindo o grupo…",link:"Abrindo…"};',
  'function diz(x){if(!s)return;s.textContent=x;clearTimeout(t);if(x)t=setTimeout(function(){s.textContent=""},3000)}',
  'd.addEventListener("click",function(e){',
  'var a=e.target&&e.target.closest?e.target.closest("[data-link],[data-copiar]"):null;if(!a)return;',
  'var c=a.getAttribute("data-copiar");',
  "if(c!==null){var n=navigator.clipboard;if(n&&n.writeText)n.writeText(c).then(function(){",
  'a.textContent="Copiado";diz("CNPJ copiado.");setTimeout(function(){a.textContent="Copiar CNPJ"},2200)},function(){});return}',
  'a.classList.remove("lk-toque");void a.offsetWidth;a.classList.add("lk-toque");',
  'setTimeout(function(){a.classList.remove("lk-toque")},1600);',
  'var k=a.getAttribute("data-tipo");if(k&&M.hasOwnProperty(k))diz(M[k])});',
  'addEventListener("pageshow",function(){diz("")})',
  "})();",
].join("");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function scriptDaPagina(o: { rastreio: { metaPixelId: string; ga4Id: string } | null }): string {
  return JS; // PR 7 passa a ler o.rastreio
}
