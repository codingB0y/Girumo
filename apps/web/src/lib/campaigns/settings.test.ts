import assert from "node:assert/strict";
import {
  ENTRADA_DEFAULTS,
  INTEGRACOES_DEFAULTS,
  hasIntegracao,
  isClosedAt,
  maskToken,
  mergeIntegracoes,
  parseEntradaPatch,
  parseIntegracoesPatch,
  readEntrada,
  readIntegracoes,
  withEntrada,
  withIntegracoes,
  type Integracoes,
} from "./settings";

// --- leitura tolerante ------------------------------------------------------

// Sem settings → tudo no padrão (deep link e um grupo por pessoa LIGADOS).
assert.deepEqual(readEntrada({ loja: "Mega" }), ENTRADA_DEFAULTS);
assert.deepEqual(readEntrada(null), ENTRADA_DEFAULTS);

// Campo válido é respeitado; campo inválido cai no padrão SÓ dele.
assert.deepEqual(
  readEntrada({
    settings: {
      entrada: { deep_link: false, encerra_em: "31/12/2026", lotado: { modo: "url", url: "http://inseguro" } },
    },
  }),
  { deep_link: false, um_grupo_por_pessoa: true, encerra_em: null, lotado: { modo: "aviso" } },
);
assert.deepEqual(
  readEntrada({ settings: { entrada: { lotado: { modo: "pagina", pagina_slug: "lista-saldao" } } } }).lotado,
  { modo: "pagina", pagina_slug: "lista-saldao" },
);

// --- validação estrita do PATCH --------------------------------------------

const ok = parseEntradaPatch({
  deep_link: true,
  um_grupo_por_pessoa: false,
  encerra_em: "2026-09-30",
  lotado: { modo: "url", url: "https://loja.com.br/lista" },
});
assert.equal(ok.ok, true);
if (ok.ok) assert.equal(ok.entrada.lotado.modo, "url");

// Chave desconhecida é recusada (não silenciada) — evita gravar lixo no jsonb.
const extra = parseEntradaPatch({ ...ENTRADA_DEFAULTS, pixel: "123" });
assert.equal(extra.ok, false);

// URL sem https é recusada com o nome do campo.
const http = parseEntradaPatch({ ...ENTRADA_DEFAULTS, lotado: { modo: "url", url: "http://loja.com.br" } });
assert.equal(http.ok, false);
if (!http.ok) assert.match(http.error, /lotado/);

// Data fora do formato é recusada.
const data = parseEntradaPatch({ ...ENTRADA_DEFAULTS, encerra_em: "30/09/2026" });
assert.equal(data.ok, false);
if (!data.ok) assert.match(data.error, /encerra_em/);

// --- merge sem mutação ------------------------------------------------------

const antes = { loja: "Mega", settings: { outra: 1, entrada: ENTRADA_DEFAULTS } };
const depois = withEntrada(antes, { ...ENTRADA_DEFAULTS, deep_link: false });
assert.equal((depois.settings as { outra: number }).outra, 1, "preserva outras chaves de settings");
assert.equal(depois.loja, "Mega", "preserva o resto do metadata");
assert.equal(antes.settings.entrada.deep_link, true, "não muta o original");
assert.equal((depois.settings as { entrada: { deep_link: boolean } }).entrada.deep_link, false);

// --- encerramento: fim do dia em Brasília (UTC-3) ---------------------------

assert.equal(isClosedAt(null, new Date("2026-09-30T12:00:00Z")), false);
// 23:59 de 30/09 em Brasília = 02:59Z de 01/10 → ainda aberto às 02:00Z.
assert.equal(isClosedAt("2026-09-30", new Date("2026-10-01T02:00:00Z")), false);
// 03:00Z de 01/10 já passou do fim do dia 30/09 em Brasília.
assert.equal(isClosedAt("2026-09-30", new Date("2026-10-01T03:00:00Z")), true);
// Data inválida nunca fecha (o /r/ não pode morrer por dado ruim).
assert.equal(isClosedAt("lixo", new Date()), false);

// --- integrações: leitura tolerante -----------------------------------------

// Sem nada gravado → defaults (evento Lead, resto vazio).
assert.deepEqual(readIntegracoes(null), INTEGRACOES_DEFAULTS);
assert.deepEqual(readIntegracoes({}), INTEGRACOES_DEFAULTS);
assert.deepEqual(readIntegracoes({ settings: { integracoes: "lixo" } }), INTEGRACOES_DEFAULTS);

// Campo inválido cai no padrão SÓ dele; o vizinho válido sobrevive.
const misto = readIntegracoes({
  settings: { integracoes: { meta: { pixel_id: "abc", evento: "Contact" }, ga4: { id: "G-ABC123" } } },
});
assert.equal(misto.meta.pixel_id, "", '"abc" não casa ^\\d{5,20}$');
assert.equal(misto.meta.evento, "Contact", "evento válido é preservado");
assert.equal(misto.ga4.id, "G-ABC123");

// Evento fora do formato volta pro padrão.
assert.equal(readIntegracoes({ settings: { integracoes: { meta: { evento: "1nvalido!" } } } }).meta.evento, "Lead");

// --- integrações: patch estrito ---------------------------------------------

// Pixel curto demais é recusado nomeando o campo.
const pixelRuim = parseIntegracoesPatch({
  meta: { pixel_id: "12", evento: "Lead", test_code: "" },
  ga4: { id: "" },
  google_ads: { id: "", label: "" },
});
assert.equal(pixelRuim.ok, false);
if (!pixelRuim.ok) assert.match(pixelRuim.error, /meta\.pixel_id/);

// Evento personalizado e campos preenchidos passam.
assert.equal(
  parseIntegracoesPatch({
    meta: { pixel_id: "1234567890", evento: "EntrouNoGrupo", test_code: "TEST123" },
    ga4: { id: "G-AB12CD34" },
    google_ads: { id: "AW-987654321", label: "abc_DEF-123" },
  }).ok,
  true,
);

// Chave desconhecida é recusada (strictObject) — nada de config fantasma.
assert.equal(
  parseIntegracoesPatch({
    meta: { pixel_id: "", evento: "Lead", test_code: "", tiktok: "x" },
    ga4: { id: "" },
    google_ads: { id: "", label: "" },
  }).ok,
  false,
);

// --- integrações: token write-only ------------------------------------------

const comToken: Integracoes = {
  ...INTEGRACOES_DEFAULTS,
  meta: { pixel_id: "1234567890", evento: "Lead", capi_token: "EAAsegredo", test_code: "" },
};
const patchBase = { ga4: { id: "" }, google_ads: { id: "", label: "" } };

// Omitir o token MANTÉM o que está no banco (o painel nunca o recebeu).
assert.equal(
  mergeIntegracoes(comToken, { ...patchBase, meta: { pixel_id: "1234567890", evento: "Lead", test_code: "" } }).meta
    .capi_token,
  "EAAsegredo",
);
// String vazia APAGA de propósito.
assert.equal(
  mergeIntegracoes(comToken, {
    ...patchBase,
    meta: { pixel_id: "1234567890", evento: "Lead", capi_token: "", test_code: "" },
  }).meta.capi_token,
  "",
);

// A máscara nunca deixa o valor escapar.
assert.deepEqual(maskToken(""), { capi_token_set: false, capi_token_last4: "" });
const mascarado = maskToken("EAAabcdefgh3456");
assert.deepEqual(mascarado, { capi_token_set: true, capi_token_last4: "3456" });
assert.equal(JSON.stringify(mascarado).includes("abcdefgh"), false);

// --- integrações: tem alguma configurada? -----------------------------------

assert.equal(hasIntegracao(INTEGRACOES_DEFAULTS), false);
assert.equal(hasIntegracao({ ...INTEGRACOES_DEFAULTS, ga4: { id: "G-X1" } }), true);
assert.equal(
  hasIntegracao({ ...INTEGRACOES_DEFAULTS, meta: { ...INTEGRACOES_DEFAULTS.meta, pixel_id: "1234567890" } }),
  true,
);
// Google Ads sem rótulo não conta: sem `send_to` o gtag não dispara nada.
assert.equal(hasIntegracao({ ...INTEGRACOES_DEFAULTS, google_ads: { id: "AW-1", label: "" } }), false);

// --- integrações: merge sem mutação -----------------------------------------

const antesInt = { loja: "Mega Stock", settings: { entrada: ENTRADA_DEFAULTS } };
const depoisInt = withIntegracoes(antesInt, INTEGRACOES_DEFAULTS);
assert.equal(depoisInt.loja, "Mega Stock", "preserva o resto do metadata");
assert.deepEqual((depoisInt.settings as { entrada: unknown }).entrada, ENTRADA_DEFAULTS, "preserva a entrada");
assert.equal(Object.hasOwn(antesInt.settings, "integracoes"), false, "não muta o original");

console.log("settings.test ok");
