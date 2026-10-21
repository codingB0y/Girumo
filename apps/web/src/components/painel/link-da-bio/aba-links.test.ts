// apps/web/src/components/painel/link-da-bio/aba-links.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { documentoPadrao, type LinkBio } from "@/lib/bio/documento";
import { estadoDe, type ContextoDoEditor, type ContextoDosAvisos } from "@/lib/bio/editor";
import type { CampanhaDoPainel } from "@/lib/bio/painel-api";
import type { PaginaBio } from "@/lib/stores/bio-pages";

import { AbaLinks, ListaDeLinks, type PropsDaLista } from "./aba-links";
import { ABAS, abaDoErro, abaPelaTecla, BarraDeAbas, type PropsDaAba } from "./abas";

const noop = () => {};
type Tipo<T extends LinkBio["tipo"]> = Extract<LinkBio, { tipo: T }>;

// Dados fictícios: nada da loja-piloto (repo público).
const ZAP: Tipo<"whatsapp"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b01",
  tipo: "whatsapp",
  titulo: "Falar com a vendedora",
  sub: "Pedido no WhatsApp",
  icone: "whatsapp",
  ativo: true,
  destaque: true,
  numero: "5562999990000",
  mensagem: "Oi! Vim pelo Instagram. (BIO)",
};
const GRUPO: Tipo<"grupo"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b02",
  tipo: "grupo",
  titulo: "Entrar no grupo VIP",
  sub: "",
  icone: "coroa",
  ativo: true,
  destaque: false,
  campanhaId: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01",
};
const SITE: Tipo<"link"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b03",
  tipo: "link",
  titulo: "Catálogo",
  sub: "Kits e preços",
  icone: "catalogo",
  ativo: false,
  destaque: false,
  url: "https://loja.exemplo.com.br/catalogo",
  fotos: [],
};
const LOJA: Tipo<"endereco"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b04",
  tipo: "endereco",
  titulo: "Como chegar",
  sub: "",
  icone: "mapa",
  ativo: true,
  endereco: "Rua Exemplo, 100\nCentro, Goiânia",
  horario: "",
  foto: null,
};
const CAMPANHAS: CampanhaDoPainel[] = [{ id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01", nome: "VIP Atacado", slug: "vip-atacado" }];
const PAGINA: PaginaBio = {
  id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01",
  tenantId: "tenant-exemplo",
  slug: "loja-exemplo",
  publicada: false,
  bloqueadaEm: null,
  documento: { ...documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }), links: [ZAP, GRUPO, SITE, LOJA] },
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};
const CONTEXTO: ContextoDoEditor = {
  campanhas: CAMPANHAS,
  dominio: null,
  origemGirumo: "https://www.girumo.com.br",
  sugestaoSlug: "loja-exemplo",
  linksEscondidos: [],
};
const CTX: ContextoDosAvisos = { campanhas: CAMPANHAS, linksEscondidos: [], salvos: PAGINA.documento.links };

function lista(over: Partial<PropsDaLista> = {}): string {
  const props: PropsDaLista = {
    links: PAGINA.documento.links,
    ctx: CTX,
    reordenando: false,
    movido: null,
    aoEditar: noop,
    aoAlternar: noop,
    aoMover: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(ListaDeLinks, props));
}

test("linhas na ordem da página; editar e mostrar nomeados pelo título; chips de destaque e escondido", () => {
  const h = lista();
  const posicoes = ["Falar com a vendedora", "Entrar no grupo VIP", "Catálogo", "Como chegar"].map((t) =>
    h.indexOf(`aria-label="Editar o link ${t}"`),
  );
  assert.ok(posicoes.every((p, i) => p > -1 && (i === 0 || p > posicoes[i - 1])), String(posicoes));
  assert.match(h, /<ul aria-label="Links, na ordem em que aparecem na página"/);
  assert.match(h, /role="switch" aria-checked="true" aria-label="Mostrar na página: Falar com a vendedora"/);
  assert.match(h, /role="switch" aria-checked="false" aria-label="Mostrar na página: Catálogo"/);
  assert.match(h, /Falar com a vendedora<span class="pn-chip">Destaque<\/span>/);
  assert.match(h, /Catálogo<span class="pn-chip">Escondido<\/span>/);
  assert.match(h, />WhatsApp · \+55 62 99999-0000</);
  assert.match(h, />Grupo VIP · VIP Atacado</);
  assert.match(h, />Rua Exemplo, 100</);
});

test("link escondido pela API: aviso vermelho ligado ao botão de editar daquele link", () => {
  const h = lista({ ctx: { ...CTX, linksEscondidos: [ZAP.id] } });
  assert.match(h, new RegExp(`aria-label="Editar o link Falar com a vendedora" aria-describedby="bio-link-${ZAP.id}-aviso"`));
  assert.match(h, new RegExp(`<p id="bio-link-${ZAP.id}-aviso"[^>]*>.*Este é o número conectado na Girumo`, "s"));
  assert.doesNotMatch(h, new RegExp(`bio-link-${GRUPO.id}-aviso`));
});

test("Reordenar troca os interruptores por Subir e Descer; na ponta o botão fica desligado", () => {
  const h = lista({ reordenando: true });
  assert.doesNotMatch(h, /role="switch"/);
  assert.match(h, new RegExp(`id="bio-subir-${ZAP.id}" aria-label="Subir Falar com a vendedora" disabled=""`));
  assert.match(h, new RegExp(`id="bio-descer-${LOJA.id}" aria-label="Descer Como chegar" disabled=""`));
  assert.match(h, new RegExp(`id="bio-subir-${GRUPO.id}" aria-label="Subir Entrar no grupo VIP" class=`));
  assert.match(h, new RegExp(`id="bio-descer-${ZAP.id}" aria-label="Descer Falar com a vendedora" class=`));
});

test("sem link: diz como começar", () => {
  assert.match(lista({ links: [] }), /Nenhum link ainda\. Toque em Adicionar link pra começar\./);
});

test("cartão Links: contagem, Reordenar com dois ou mais, Adicionar link com o id do foco, dica e região anunciada", () => {
  const props: PropsDaAba = {
    pagina: PAGINA,
    rascunho: estadoDe(PAGINA),
    contexto: CONTEXTO,
    mudarDocumento: noop,
    mudarPagina: noop,
    reverAnimacao: noop,
    erro: null,
    limparErro: noop,
  };
  const h = renderToStaticMarkup(createElement(AbaLinks, props));
  assert.match(h, /<h2 id="bio-links-titulo"[^>]*>Links<\/h2>/);
  assert.match(h, />4 links · 3 aparecendo na página</);
  assert.match(h, />Reordenar</);
  assert.match(h, /id="bio-adicionar-link" aria-haspopup="dialog"/);
  assert.match(h, /Desligado, o link some da página mas fica guardado aqui\. Só um link fica em destaque\./);
  assert.match(h, /<p aria-live="polite" class="sr-only"><\/p>/);
  const um = renderToStaticMarkup(
    createElement(AbaLinks, { ...props, rascunho: { ...estadoDe(PAGINA), documento: { ...PAGINA.documento, links: [LOJA] } } }),
  );
  assert.doesNotMatch(um, />Reordenar</);
});

test("abas: a seta anda em roda, Home e End vão às pontas, o resto não mexe", () => {
  assert.equal(abaPelaTecla(0, "ArrowRight", 4), 1);
  assert.equal(abaPelaTecla(3, "ArrowRight", 4), 0);
  assert.equal(abaPelaTecla(0, "ArrowLeft", 4), 3);
  assert.equal(abaPelaTecla(2, "Home", 4), 0);
  assert.equal(abaPelaTecla(1, "End", 4), 3);
  assert.equal(abaPelaTecla(1, "Enter", 4), null);
  assert.equal(abaPelaTecla(0, "ArrowRight", 1), 0);
});

test("barra de abas WAI-ARIA e dona do erro: tablist nomeado, painel controlado, tabindex móvel", () => {
  const abas = [ABAS[0], { ...ABAS[0], id: "perfil" as const, nome: "Perfil" }];
  const h = renderToStaticMarkup(createElement(BarraDeAbas, { abas, atual: "links", aoEscolher: noop }));
  assert.match(h, /role="tablist" aria-label="Partes da página"/);
  assert.match(h, /role="tab" id="bio-aba-links" aria-selected="true" aria-controls="bio-painel-links" tabindex="0"/);
  assert.match(h, /role="tab" id="bio-aba-perfil" aria-selected="false" aria-controls="bio-painel-perfil" tabindex="-1"/);
  assert.equal(ABAS[0].dona("links.2.numero"), true);
  assert.equal(ABAS[0].dona("links"), true);
  assert.equal(ABAS[0].dona("perfil.nome"), false);
  assert.equal(abaDoErro({ campo: "links.0.url", mensagem: "x" })?.id, "links");
  assert.equal(abaDoErro({ campo: "slug", mensagem: "x" }), undefined);
  assert.equal(abaDoErro(null), undefined);
});
