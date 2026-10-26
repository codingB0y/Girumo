// apps/web/src/components/painel/link-da-bio/aba-aparencia.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DocumentoBio } from "@/lib/bio/documento";
import { estadoDe, type ContextoDoEditor } from "@/lib/bio/editor";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { documentoFalso, IDS } from "@/test/bio-dados-falsos";

import { AbaAparencia } from "./aba-aparencia";
import { abaDoErro, type PropsDaAba } from "./abas";

const noop = () => {};
// A loja fictícia do PR 3a: nada da loja-piloto (repo público).
const DOC = documentoFalso();
const PAGINA: PaginaBio = {
  id: IDS.pagina,
  tenantId: "tenant-exemplo",
  slug: "atelie-exemplo",
  publicada: false,
  bloqueadaEm: null,
  documento: DOC,
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};
const CONTEXTO: ContextoDoEditor = {
  campanhas: [{ id: IDS.campanha, nome: "VIP Exemplo", slug: "vip-exemplo" }],
  dominio: null,
  origemGirumo: "https://www.girumo.com.br",
  sugestaoSlug: "atelie-exemplo",
  linksEscondidos: [],
};

function html(documento: DocumentoBio = DOC): string {
  const props: PropsDaAba = {
    pagina: PAGINA,
    rascunho: { ...estadoDe(PAGINA), documento },
    contexto: CONTEXTO,
    mudarDocumento: noop,
    mudarPagina: noop,
    reverAnimacao: noop,
    erro: null,
    limparErro: noop,
  };
  return renderToStaticMarkup(createElement(AbaAparencia, props));
}

/** O `<button>` cujo texto termina em `nome`, do `<button` ao `</button>`. */
function botao(h: string, nome: string): string {
  return new RegExp(String.raw`<button(?:(?!<button)[\s\S])*?>${nome}</button>`).exec(h)?.[0] ?? "";
}

test("quatro modelos com miniatura viva (inert, fora do Tab, escondida do leitor), nome, descrição e o atual marcado", () => {
  const h = html();
  assert.equal(h.match(/sandbox="" tabindex="-1" inert="" aria-hidden="true"/g)?.length, 4);
  assert.match(botao(h, "Etiqueta"), /aria-pressed="true" aria-describedby="bio-modelo-etiqueta-desc"/);
  for (const nome of ["Vitrine", "Romaneio", "Clássico"]) assert.match(botao(h, nome), /aria-pressed="false"/, nome);
  assert.match(h, /<p id="bio-modelo-romaneio-desc"[^>]*>A nota do fardo: itens numerados e o botão principal carimbado\.<\/p>/);
});

test("cores: as quatro paletas do modelo com nome e bolinhas, a atual marcada; os seletores só com a marca", () => {
  const h = html();
  assert.match(botao(h, "Azul"), /aria-pressed="true"/);
  assert.match(botao(h, "Azul"), /style="background-color:#286AA6"[\s\S]*style="background-color:#E98B2B"/);
  for (const nome of ["Rosa chiclete", "Verde-água", "Grafite e dourado"]) assert.match(botao(h, nome), /aria-pressed="false"/, nome);
  assert.match(botao(h, "Cores da sua marca"), /aria-pressed="false"/);
  assert.doesNotMatch(h, /id="bio-cores-fundo"/);
  const marca = html({ ...DOC, paleta: "marca", cores: { fundo: "#FFF0E0", botao: "#C2185B" } });
  assert.match(botao(marca, "Cores da sua marca"), /aria-pressed="true"/);
  assert.match(marca, /<label for="bio-cores-fundo"[^>]*>Fundo da página<\/label>/);
  assert.match(marca, /<input type="color" id="bio-cores-fundo"[^>]*value="#fff0e0"/);
  assert.match(marca, /id="bio-cores-botao-hex" aria-label="Botão em destaque, código da cor"[^>]*value="#C2185B"/);
  // No Romaneio, as paletas dele.
  const romaneio = html({ ...DOC, modelo: "romaneio", paleta: "kraft" });
  for (const nome of ["Kraft", "Azul caneta", "Verde nota", "Azul"]) assert.ok(botao(romaneio, nome), nome);
});

test("Animação de entrada: interruptor e Rever a animação, desligado com a animação desligada", () => {
  const h = html();
  assert.match(h, /role="switch" aria-checked="true" aria-label="Animação de entrada"/);
  assert.match(botao(h, "Rever a animação"), /^<button type="button" class=/);
  assert.match(botao(html({ ...DOC, animar: false }), "Rever a animação"), /^<button type="button" disabled=""/);
});

test("os erros de modelo, paleta, cores e animação vão pra Aparência", () => {
  for (const campo of ["modelo", "paleta", "cores", "cores.fundo", "animar"]) {
    assert.equal(abaDoErro({ campo, mensagem: "x" })?.id, "aparencia", campo);
  }
  assert.equal(abaDoErro({ campo: "coresx", mensagem: "x" }), undefined);
});
