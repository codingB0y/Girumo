/**
 * O JS inline da página do link da bio, devolvido sem a tag (o `index.ts` o
 * embrulha em `<script nonce>`). Nenhum texto do lojista entra aqui: o script
 * só lê `data-*` que o renderizador emite (uuid da página e do link, tipo de
 * lista fechada, CNPJ sem pontuação, só [0-9A-Z]). PR 3a: "Abrindo…" no `#lk-status`, balanço do
 * toque e "Copiado". PR 4b: o beacon do toque (`POST /api/p/bio/toque`, corpo
 * `{"p":<página>,"l":<link>}` em text/plain, sem preflight); no `<summary>` do
 * endereço, só quando abre. PR 7: o Pixel e o GA4 a partir de `rastreio`.
 */
const JS = [
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
  'var k=a.getAttribute("data-tipo");if(k&&M.hasOwnProperty(k))diz(M[k])});',
  'addEventListener("pageshow",function(){diz("")})',
  "})();",
].join("");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function scriptDaPagina(o: { rastreio: { metaPixelId: string; ga4Id: string } | null }): string {
  return JS; // PR 7 passa a ler o.rastreio
}
