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
assert.match(comPixel, /fbq\('init','123456789'\)/);
assert.match(comPixel, /fbq\('track','Lead'\)/);

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

console.log("entry-page.test ok");
