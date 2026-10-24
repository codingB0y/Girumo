// apps/web/src/components/painel/link-da-bio/campo-de-foto.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CampoDeFoto, CampoDeFotos, type PropsDoCampoDeFoto } from "./campo-de-foto";

const noop = () => {};

function foto(over: Partial<PropsDoCampoDeFoto> = {}): string {
  const props: PropsDoCampoDeFoto = {
    id: "bio-perfil-capa",
    rotulo: "Foto da loja",
    nome: "foto da loja",
    tipo: "lp-media",
    formato: "foto",
    valor: null,
    aoMudar: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(CampoDeFoto, props));
}

test("sem foto: Escolher com o nome do campo; seletor de arquivo escondido, fora do Tab, só PNG, JPEG e WebP", () => {
  const h = foto();
  assert.match(h, /<button type="button" id="bio-perfil-capa" aria-label="Escolher foto da loja"[^>]*>[\s\S]*Escolher foto<\/button>/);
  assert.doesNotMatch(h, /Remover/);
  assert.match(h, /<input type="file" accept="image\/png,image\/jpeg,image\/webp" tabindex="-1" aria-hidden="true" class="sr-only"\/>/);
  assert.doesNotMatch(h, /<img /);
});

test("com foto: miniatura pelo otimizador no ponto de foco, Trocar e Remover", () => {
  const h = foto({ valor: { id: "capa-falsa", foco: { x: 0.5, y: 0.3 } } });
  assert.match(
    h,
    /<img src="\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Fcapa-falsa&amp;w=128&amp;q=75" alt="" width="64" height="80" style="object-position:50% 30%"/,
  );
  assert.match(h, /aria-label="Trocar foto da loja"[^>]*>[\s\S]*Trocar foto<\/button>/);
  assert.match(h, /<button type="button" aria-label="Remover foto da loja"[^>]*>Remover<\/button>/);
});

test("logo clara em fundo escuro, logo escura em fundo claro; a logo vem pelo otimizador em 256", () => {
  const clara = foto({
    id: "bio-perfil-logoClara",
    rotulo: "Logo clara",
    nome: "logo clara",
    ajuda: "Pra fundo escuro",
    tipo: "lp-logo",
    formato: "logo-clara",
    valor: { id: "logo-clara-falsa", foco: null },
  });
  assert.match(clara, /class="[^"]*bg-volt-950[^"]*"><img src="\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Flogo-clara-falsa&amp;w=256&amp;q=75"/);
  assert.match(clara, /id="bio-perfil-logoClara" aria-label="Trocar logo clara" aria-describedby="bio-perfil-logoClara-ajuda"/);
  const escura = foto({ formato: "logo-escura", tipo: "lp-logo", nome: "logo escura" });
  assert.match(escura, /class="[^"]*bg-canvas-100[^"]*"><svg/);
  assert.match(escura, /aria-label="Escolher logo escura"[^>]*>[\s\S]*Escolher logo<\/button>/);
});

test("erro do salvar: embaixo do campo, ligado ao botão e anunciado", () => {
  const h = foto({ valor: { id: "capa-falsa", foco: null }, erro: "Essa foto não é da loja. Envie de novo." });
  assert.match(h, /id="bio-perfil-capa" aria-label="Trocar foto da loja" aria-describedby="bio-perfil-capa-erro"/);
  assert.match(h, /<p id="bio-perfil-capa-erro" role="alert"[^>]*>Essa foto não é da loja\. Envie de novo\.<\/p>/);
});

test("fotos do botão: miniatura e Remover de cada uma; Escolher fotos (várias) só enquanto cabe", () => {
  const html = (n: number) =>
    renderToStaticMarkup(
      createElement(CampoDeFotos, {
        id: "bio-link-fotos",
        valor: Array.from({ length: n }, (_, i) => ({ id: `kit-${i + 1}-falso`, foco: null })),
        aoMudar: noop,
      }),
    );
  const duas = html(2);
  assert.match(duas, /<span id="bio-link-fotos-rotulo"[^>]*>Fotos no botão \(opcional, até 3\)<\/span>/);
  assert.match(duas, /<ul aria-labelledby="bio-link-fotos-rotulo"/);
  assert.equal(duas.match(/<img /g)?.length, 2);
  assert.match(duas, /src="\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Fkit-1-falso&amp;w=128&amp;q=75"/);
  assert.match(duas, /aria-label="Remover a foto 2"/);
  assert.match(duas, /<button type="button" id="bio-link-fotos" aria-describedby="bio-link-fotos-ajuda"[^>]*>[\s\S]*Escolher fotos<\/button>/);
  assert.match(duas, /<input type="file" accept="image\/png,image\/jpeg,image\/webp" multiple="" tabindex="-1"/);
  assert.doesNotMatch(html(3), /Escolher fotos/);
  assert.doesNotMatch(html(0), /<ul /);
});

test("fotos do botão: erro do salvar ligado ao botão; com 3 fotos o grupo recebe o foco; Remover trava no envio", () => {
  const fotos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `kit-${i + 1}-falso`, foco: null }));
  const dois = renderToStaticMarkup(createElement(CampoDeFotos, { id: "bio-link-fotos", valor: fotos(2), aoMudar: noop, erro: "Foto fora da loja." }));
  assert.match(dois, /id="bio-link-fotos" aria-describedby="bio-link-fotos-erro bio-link-fotos-ajuda"/);
  assert.match(dois, /<p id="bio-link-fotos-erro" role="alert"[^>]*>Foto fora da loja\.<\/p>/);
  const tres = renderToStaticMarkup(createElement(CampoDeFotos, { id: "bio-link-fotos", valor: fotos(3), aoMudar: noop, erro: "x" }));
  assert.match(tres, /<div id="bio-link-fotos" tabindex="-1"/);
  assert.doesNotMatch(tres, /<button type="button" id="bio-link-fotos"/);
});
