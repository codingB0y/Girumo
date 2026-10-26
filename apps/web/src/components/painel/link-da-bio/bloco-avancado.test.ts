// apps/web/src/components/painel/link-da-bio/bloco-avancado.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { lugarDoErro } from "@/lib/bio/editor";

import { BlocoAvancado, ConteudoDoAvancado, LUGARES_DO_AVANCADO, type PropsDoConteudo } from "./bloco-avancado";

// Dados fictícios: nada de cliente (repo público).
const noop = () => {};
const VAZIO = { metaPixelId: "", ga4Id: "" };
const FRASE_GA4 = "Confira o ID de medição: G- e pelo menos 4 letras ou números, como G-AB12CD34EF.";

function conteudo(over: Partial<PropsDoConteudo> = {}): string {
  const props: PropsDoConteudo = { rastreio: VAZIO, aberto: false, erros: {}, aoAlternar: noop, aoMudar: noop, ...over };
  return renderToStaticMarkup(createElement(ConteudoDoAvancado, props));
}

function bloco(erroDe: (lugar: string) => string | undefined, rastreio = VAZIO): string {
  return renderToStaticMarkup(createElement(BlocoAvancado, { rastreio, mudarDocumento: noop, erroDe, corrigiu: noop }));
}

test("fechado por padrão: botão Avançado no h2 com aria-expanded=false, a dica e nenhum campo", () => {
  const h = bloco(() => undefined);
  assert.match(h, /<h2[^>]*><button type="button" id="bio-avancado" aria-expanded="false"[^>]*><span[^>]*>Avançado<\/span>/);
  assert.doesNotMatch(h, /aria-controls=/);
  assert.match(h, />Pixel da Meta e Google Analytics, se a loja já usa\.</);
  assert.doesNotMatch(h, /bio-rastreio-|Configurado/);
});

test("aberto: os dois campos com rótulo, ajuda ligada e o valor; o pixel pede teclado numérico", () => {
  const h = conteudo({ aberto: true, rastreio: { metaPixelId: "1234567890", ga4Id: "G-AB12CD34EF" } });
  assert.match(h, /aria-expanded="true" aria-controls="bio-avancado-campos"/);
  assert.match(h, /<label for="bio-rastreio-metaPixelId"[^>]*>ID do pixel da Meta<\/label>/);
  assert.match(
    h,
    /<input type="text" inputMode="numeric"[^>]*id="bio-rastreio-metaPixelId" maxLength="30"[^>]*aria-describedby="bio-rastreio-metaPixelId-ajuda"[^>]*value="1234567890"\/>/,
  );
  assert.match(h, /<label for="bio-rastreio-ga4Id"[^>]*>ID de medição do Google Analytics 4<\/label>/);
  assert.match(h, /<input type="text" autoCapitalize="characters"[^>]*id="bio-rastreio-ga4Id"[^>]*value="G-AB12CD34EF"\/>/);
  assert.match(h, /<p id="bio-rastreio-metaPixelId-ajuda"[^>]*>Só números\. Está no Gerenciador de Eventos/);
  assert.match(h, /PageView ao abrir, Contact no botão do WhatsApp e BioToque nos outros\./);
  assert.match(h, /page_view ao abrir e bio_toque em cada botão tocado\./);
  assert.doesNotMatch(h, /aria-invalid="/);
});

test("erro do salvar no GA4: o bloco já abre com a frase embaixo do campo certo; o outro fica limpo", () => {
  assert.equal(lugarDoErro("rastreio.ga4Id", LUGARES_DO_AVANCADO), "rastreio.ga4Id");
  const h = bloco((lugar) => (lugar === "rastreio.ga4Id" ? FRASE_GA4 : undefined), { metaPixelId: "1234567890", ga4Id: "G-AB" });
  assert.match(h, /id="bio-avancado" aria-expanded="true" aria-controls="bio-avancado-campos"/);
  assert.match(
    h,
    /id="bio-rastreio-ga4Id"[^>]*aria-invalid="true" aria-describedby="bio-rastreio-ga4Id-erro bio-rastreio-ga4Id-ajuda"/,
  );
  assert.match(h, /<p id="bio-rastreio-ga4Id-erro"[^>]*>Confira o ID de medição: G- e pelo menos 4 letras ou números, como G-AB12CD34EF\.<\/p>/);
  assert.doesNotMatch(h, /id="bio-rastreio-metaPixelId"[^>]*aria-invalid="/);
  assert.doesNotMatch(h, /bio-rastreio-metaPixelId-erro/);
});

test("com id preenchido, o cabeçalho fechado diz Configurado", () => {
  assert.match(conteudo({ rastreio: { metaPixelId: "1234567890", ga4Id: "" } }), /Avançado<span class="pn-chip">Configurado<\/span>/);
  assert.doesNotMatch(conteudo(), /Configurado/);
  assert.doesNotMatch(conteudo({ rastreio: { metaPixelId: "   ", ga4Id: "" } }), /Configurado/);
});
