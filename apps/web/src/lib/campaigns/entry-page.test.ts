import assert from "node:assert/strict";
import { LOTADO_REASONS, lotadoRedirect, renderBlockedPage, renderEntryPage } from "./entry-page";

const base = {
  loja: "Mega <Stock>",
  campaignName: "Saldão",
  groupName: "Saldão 14",
  httpsUrl: "https://chat.whatsapp.com/AbC123xyz",
  nonce: "AAAAAAAAAAAAAAAAAAAAAA==",
};

// Com deep link: o script tenta o esquema e guarda o https como fallback; o botão aponta pro esquema.
const mobile = renderEntryPage({ ...base, deepLinkUrl: "whatsapp://chat?code=AbC123xyz" });
assert.match(mobile, /whatsapp:\/\/chat\?code=AbC123xyz/);
assert.match(mobile, /visibilityState/);
assert.match(mobile, /href="whatsapp:\/\/chat\?code=AbC123xyz"/);
assert.match(mobile, /Mega &lt;Stock&gt;/, "nome da loja escapado");
assert.match(mobile, /Saldão 14/);
assert.match(mobile, /<noscript><meta http-equiv="refresh" content="0;url=https:\/\/chat\.whatsapp\.com\/AbC123xyz">/);
// Todo <script> leva o nonce — sem ele a CSP do /r/ mata a página.
const scripts = mobile.match(/<script[^>]*>/g) ?? [];
assert.ok(scripts.length >= 1);
for (const tag of scripts) assert.match(tag, /nonce="AAAAAAAAAAAAAAAAAAAAAA=="/);

// Sem deep link: nada de esquema, o botão aponta pro https.
const desktop = renderEntryPage({ ...base, deepLinkUrl: null });
assert.doesNotMatch(desktop, /whatsapp:\/\//);
assert.match(desktop, /href="https:\/\/chat\.whatsapp\.com\/AbC123xyz"/);

// Pixel só entra quando há id — e o snippet dispara Lead.
assert.doesNotMatch(desktop, /fbevents/);
const comPixel = renderEntryPage({ ...base, deepLinkUrl: null, pixelId: "123456789" });
// Aspas duplas: o id e o nome do evento saem por JSON.stringify (escapa aspas
// e barras), não por interpolação crua.
assert.match(comPixel, /fbq\('init',"123456789"\)/);
assert.match(comPixel, /fbq\('track',"Lead"\)/);

// Sem grupo nomeado a frase muda, sem "undefined".
const semNome = renderEntryPage({ ...base, groupName: null, deepLinkUrl: null });
assert.doesNotMatch(semNome, /undefined/);

// Tela de lotado/aviso: loja e mensagem escapadas.
const aviso = renderBlockedPage({ loja: "Mega", title: "Grupo cheio", message: "Todos <cheios>" });
assert.match(aviso, /Todos &lt;cheios&gt;/);
assert.match(aviso, /Mega/);

// Destino de lotado: só os motivos de lotação/encerramento redirecionam.
const origin = "https://www.girumo.com.br";
assert.equal(lotadoRedirect("all-full", { modo: "aviso" }, origin), null);
assert.equal(lotadoRedirect("all-full", { modo: "pagina", pagina_slug: "lista" }, origin), `${origin}/p/lista`);
assert.equal(lotadoRedirect("closed", { modo: "url", url: "https://loja.com.br/x" }, origin), "https://loja.com.br/x");
assert.equal(lotadoRedirect("cap-reached", { modo: "url", url: "https://loja.com.br/x" }, origin), "https://loja.com.br/x");
// Campanha NÃO configurada nunca vira lista de espera (esconderia o problema do lojista).
assert.equal(lotadoRedirect("no-invite", { modo: "url", url: "https://loja.com.br/x" }, origin), null);
assert.equal(lotadoRedirect("no-admin", { modo: "pagina", pagina_slug: "lista" }, origin), null);
assert.equal(lotadoRedirect("empty-pool", { modo: "pagina", pagina_slug: "lista" }, origin), null);
assert.deepEqual([...LOTADO_REASONS].sort(), ["all-full", "cap-reached", "closed"]);

// --- integrações na tela de entrada -----------------------------------------

const comum = {
  loja: "Mega Stock",
  campaignName: "Grade de verão",
  groupName: "Grade #3",
  httpsUrl: "https://chat.whatsapp.com/ABC123",
  deepLinkUrl: null,
  nonce: "AAAAAAAAAAAAAAAAAAAAAA==",
};

// O evento escolhido manda, e o eventID casa com o que o CAPI vai enviar.
const comEvento = renderEntryPage({ ...comum, pixelId: "1234567890", evento: "Contact", eventId: "abc-123" });
assert.match(comEvento, /fbq\('init',"1234567890"\)/);
assert.match(comEvento, /fbq\('track',"Contact",\{\},\{eventID:"abc-123"\}\)/);

// Link comum (sem campanha) não tem eventId — o disparo continua válido.
assert.match(renderEntryPage({ ...comum, pixelId: "1234567890" }), /fbq\('track',"Lead"\)/);

// GA4 e Google Ads entram pelo mesmo gtag.js, com send_to montado.
const comGoogle = renderEntryPage({ ...comum, ga4Id: "G-AB12CD34", googleAds: { id: "AW-99", label: "rot_1" } });
assert.match(comGoogle, /googletagmanager\.com\/gtag\/js\?id=G-AB12CD34/);
assert.match(comGoogle, /gtag\('event','generate_lead'\)/);
assert.match(comGoogle, /send_to:"AW-99\/rot_1"/);

// Google Ads sem rótulo não dispara conversão nenhuma.
assert.equal(renderEntryPage({ ...comum, googleAds: { id: "AW-99", label: "" } }).includes("send_to"), false);

// TODO script inline carrega o nonce — sem ele a CSP mata a página inteira.
const cheio = renderEntryPage({
  ...comum,
  deepLinkUrl: "whatsapp://chat?code=ABC123",
  pixelId: "1234567890",
  ga4Id: "G-AB12CD34",
  eventId: "abc-123",
});
const tagsDeScript = cheio.match(/<script[^>]*>/g) ?? [];
assert.ok(tagsDeScript.length >= 4, `esperava pixel + gtag.js + gtag inline + navegação, veio ${tagsDeScript.length}`);
for (const s of tagsDeScript) assert.match(s, /nonce="AAAAAAAAAAAAAAAAAAAAAA=="/, `script sem nonce: ${s}`);

// Sem integração e sem deep link: nenhum script de terceiro na página.
const limpo = renderEntryPage(comum);
assert.equal(limpo.includes("connect.facebook.net"), false);
assert.equal(limpo.includes("googletagmanager.com"), false);

// Prévia do painel: zero script, nem o de navegação — o painel não pode
// disparar Lead falso no pixel do lojista. O botão continua na tela.
const previa = renderEntryPage({
  ...comum,
  deepLinkUrl: "whatsapp://chat?code=ABC123",
  pixelId: "1234567890",
  ga4Id: "G-AB12CD34",
  preview: true,
});
assert.equal(previa.includes("<script"), false, "prévia não pode ter script");
assert.equal(previa.includes('http-equiv="refresh"'), false, "prévia não pode navegar nem por noscript");
assert.match(previa, /Abrir WhatsApp/);

console.log("entry-page.test ok");
