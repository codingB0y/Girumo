// apps/web/src/components/painel/link-da-bio/aba-divulgar.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { estadoDe, type ContextoDoEditor, type ErroDeCampo, type EstadoSalvavel } from "@/lib/bio/editor";
import { resumoDoRelatorio } from "@/lib/bio/editor-divulgar";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { documentoFalso, IDS } from "@/test/bio-dados-falsos";

import { AbaDivulgar } from "./aba-divulgar";
import { ABAS, abaDoErro, type PropsDaAba } from "./abas";
import { NumerosDaPagina, QuadroDosNumeros } from "./numeros-da-pagina";

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
  campanhas: [],
  dominio: null,
  origemGirumo: "https://www.girumo.com.br",
  sugestaoSlug: "atelie-exemplo",
  linksEscondidos: [],
};

function html(
  o: { pagina?: Partial<PaginaBio>; rascunho?: Partial<EstadoSalvavel>; contexto?: Partial<ContextoDoEditor>; erro?: ErroDeCampo } = {},
): string {
  const pagina: PaginaBio = { ...PAGINA, ...o.pagina };
  const props: PropsDaAba = {
    pagina,
    rascunho: { ...estadoDe(pagina), ...o.rascunho },
    contexto: { ...CONTEXTO, ...o.contexto },
    mudarDocumento: noop,
    mudarPagina: noop,
    reverAnimacao: noop,
    erro: o.erro ?? null,
    limparErro: noop,
  };
  return renderToStaticMarkup(createElement(AbaDivulgar, props));
}

/** O `<button>` cujo texto termina em `nome`, do `<button` ao `</button>`. */
function botao(h: string, nome: string): string {
  return new RegExp(String.raw`<button(?:(?!<button)[\s\S])*?>${nome}</button>`).exec(h)?.[0] ?? "";
}

test("Página no ar: interruptor com o rascunho e o que acontece ao salvar; bloqueada trava", () => {
  const h = html();
  assert.match(h, /role="switch" aria-checked="false" aria-label="Página no ar"/);
  assert.match(h, />Fora do ar: quem abre o endereço vê “Página não encontrada”\.</);
  const vai = html({ rascunho: { publicada: true } });
  assert.match(vai, /role="switch" aria-checked="true" aria-label="Página no ar"/);
  assert.match(vai, />Vai pro ar quando você salvar\.</);
  const bloqueada = html({ pagina: { publicada: true, bloqueadaEm: "2026-10-19T12:00:00.000Z" } });
  assert.match(bloqueada, /role="switch" aria-checked="false" aria-label="Página no ar" disabled=""/);
  assert.match(bloqueada, />A Girumo tirou esta página do ar/);
});

test("endereço: o principal com Copiar; o da Girumo com o começo fixo e o slug editável, que avisa ser o atual", () => {
  const h = html();
  assert.match(h, />https:\/\/www\.girumo\.com\.br\/bio\/atelie-exemplo</);
  assert.ok(botao(h, "Copiar o endereço"));
  assert.match(h, /<label for="bio-slug"[^>]*>Endereço na Girumo<\/label>/);
  assert.match(h, /<span aria-hidden="true"[^>]*>girumo\.com\.br\/bio\/<\/span>/);
  assert.match(h, /<input type="text" id="bio-slug"[^>]*aria-describedby="bio-slug-msg"[^>]*value="atelie-exemplo"/);
  assert.match(h, /<p id="bio-slug-msg" aria-live="polite"[^>]*>Este é o endereço atual da página\.<\/p>/);
  const dominio = html({ contexto: { dominio: "links.loja.com.br" } });
  assert.match(dominio, />https:\/\/links\.loja\.com\.br\/</);
  assert.match(dominio, /No seu domínio/);
});

test("trocar o endereço: avisa que o antigo leva pro novo; formato e reservado avisam na hora, sem ir ao servidor", () => {
  const novo = html({ rascunho: { slug: "atelie-novo" } });
  assert.match(novo, />Conferindo se está livre…</);
  assert.match(novo, /Quando você salvar, o endereço antigo \(girumo\.com\.br\/bio\/atelie-exemplo\) passa a levar pro novo\./);
  const curto = html({ rascunho: { slug: "ab" } });
  assert.match(curto, /id="bio-slug"[^>]*aria-invalid="true"/);
  assert.match(curto, />Use de 3 a 40 letras minúsculas, números e hífen, sem espaço nem acento\.</);
  assert.match(html({ rascunho: { slug: "loja-girumo" } }), />Esse endereço é reservado\. Escolha outro\.</);
  assert.doesNotMatch(html(), /passa a levar pro novo/);
});

test("erro do salvar no endereço fica embaixo do campo, ligado a ele", () => {
  const h = html({ rascunho: { slug: "atelie-novo" }, erro: { campo: "slug", mensagem: "Esse endereço já está em uso. Escolha outro." } });
  assert.match(h, /id="bio-slug"[^>]*aria-invalid="true" aria-describedby="bio-slug-msg"/);
  assert.match(h, /<p id="bio-slug-msg" aria-live="polite"[^>]*>Esse endereço já está em uso\. Escolha outro\.<\/p>/);
  assert.doesNotMatch(h, /id="bio-aba-aviso"/);
});

test("Instagram passo a passo e o QR do endereço da Girumo (o salvo, mesmo com domínio), com Baixar", () => {
  const h = html({ contexto: { dominio: "links.loja.com.br" }, rascunho: { slug: "atelie-novo" } });
  assert.match(h, /<ol[^>]*>[\s\S]*Editar perfil[\s\S]*<\/ol>/);
  assert.match(
    h,
    /<canvas style="height:128px;width:128px" height="512" width="512" role="img" aria-label="QR code que abre https:\/\/www\.girumo\.com\.br\/bio\/atelie-exemplo"/,
  );
  assert.ok(botao(h, "Baixar o QR code"));
});

test("Últimos dias: período 7 ou 30 com o atual marcado; carregando anunciado", () => {
  const h = renderToStaticMarkup(createElement(NumerosDaPagina, { links: DOC.links }));
  assert.match(h, /<h2 id="bio-numeros-titulo"[^>]*>Últimos 7 dias<\/h2>/);
  assert.match(h, /role="group" aria-label="Período"/);
  assert.match(h, /<button type="button" aria-pressed="true"[^>]*>7 dias<\/button>/);
  assert.match(h, /<button type="button" aria-pressed="false"[^>]*>30 dias<\/button>/);
  assert.match(h, /role="status"[^>]*><span class="sr-only">Carregando os números…<\/span>/);
});

test("números: visitas, toques e toques por visita; tabela dos botões; sem visita, diz o que fazer", () => {
  const resumo = resumoDoRelatorio({ visitas: 1234, toques: 470, porLink: [{ linkId: IDS.whatsapp, toques: 300 }], porDia: [] }, DOC.links);
  const h = renderToStaticMarkup(createElement(QuadroDosNumeros, { resumo }));
  assert.match(h, /<dt[^>]*>Visitas<\/dt><dd[^>]*>1\.234<\/dd>/);
  assert.match(h, /<dt[^>]*>Toques por visita<\/dt><dd[^>]*>0,38<\/dd>/);
  assert.match(h, /<caption class="sr-only">Toques em cada botão<\/caption>/);
  assert.match(h, /<td[^>]*>Falar com a vendedora<\/td><td[^>]*>300<\/td>/);
  const vazio = renderToStaticMarkup(
    createElement(QuadroDosNumeros, { resumo: resumoDoRelatorio({ visitas: 0, toques: 0, porLink: [], porDia: [] }, DOC.links) }),
  );
  assert.match(vazio, /Nenhuma visita nesses dias\. Quando o endereço estiver na bio, os números aparecem aqui\./);
});

test("registro das abas: Links, Aparência, Perfil e Divulgar; endereço e Página no ar são da Divulgar", () => {
  assert.deepEqual(
    ABAS.map((a) => [a.id, a.nome]),
    [
      ["links", "Links"],
      ["aparencia", "Aparência"],
      ["perfil", "Perfil"],
      ["divulgar", "Divulgar"],
    ],
  );
  assert.equal(abaDoErro({ campo: "slug", mensagem: "x" })?.id, "divulgar");
  assert.equal(abaDoErro({ campo: "publicada", mensagem: "x" })?.id, "divulgar");
  assert.equal(abaDoErro({ campo: "slugs", mensagem: "x" }), undefined);
  assert.equal(abaDoErro({ campo: "v", mensagem: "x" }), undefined);
});
