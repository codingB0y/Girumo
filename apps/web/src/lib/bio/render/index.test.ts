import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { documentoBio, documentoPadrao, type DadosRender } from "@/lib/bio/documento";
import { getPublicSiteUrl } from "@/lib/brand";
import { IDS, dadosCheios, dadosFalsos } from "@/test/bio-dados-falsos";
import { CSS_ETIQUETA } from "./etiqueta";
import { renderPaginaBio, renderPaginaNaoEncontrada } from "./index";
import { CSS_BASE } from "./partes";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const publica = (d: DadosRender, animarEntrada = true) => renderPaginaBio(d, { modo: "publica", nonce: NONCE, animarEntrada });
const comPerfil = (mudar: Partial<DadosRender["documento"]["perfil"]>): DadosRender => {
  const d = dadosFalsos();
  return { ...d, documento: { ...d.documento, perfil: { ...d.documento.perfil, ...mudar } } };
};
const conta = (html: string, re: RegExp) => html.match(re)?.length ?? 0;

test("os dados falsos são documentos válidos pelo zod do PR 2", () => {
  documentoBio.parse(dadosFalsos().documento);
  documentoBio.parse(dadosCheios().documento);
});

test("cabeça: idioma, título, noindex, descrição, Open Graph, cor do tema, ícone e só a fonte do modelo", () => {
  const html = publica(dadosFalsos());
  assert.match(html, /^<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">/);
  assert.match(html, /<title>Ateliê Exemplo Kids<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<meta name="description" content="Kits de roupa infantil pra revender, do RN ao 14 anos\.">/);
  assert.match(html, /<meta property="og:title" content="Ateliê Exemplo Kids">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/www\.girumo\.com\.br\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Fcapa-falsa&amp;w=828&amp;q=75">/);
  assert.match(html, /<meta name="theme-color" content="#[0-9A-F]{6}">/);
  const fundo2 = html.match(/--fundo2:(#[0-9A-Fa-f]{6})/)?.[1];
  assert.ok(fundo2, "o CSS emite o token --fundo2");
  assert.equal(html.match(/<meta name="theme-color" content="([^"]+)">/)?.[1], fundo2); // o topo do degradê é o fundo2
  assert.match(html, /<link rel="icon" href="\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Flogo-clara-falsa&amp;w=384&amp;q=75">/);
  assert.equal(conta(html, /rel="preload"/g), 1);
  assert.match(html, /<link rel="preload" href="\/fonts\/bio\/lexend\/lexend-latin\.woff2" as="font" type="font\/woff2" crossorigin>/);
  assert.match(html, /@font-face\{font-family:"Lexend";font-style:normal;font-weight:100 900;font-display:swap;src:url\(\/fonts\/bio\/lexend\/lexend-latin\.woff2\) format\("woff2"\)\}/);
  assert.match(html, /<body data-pagina="0c8f6a2e-5b1d-4c3a-9e7f-1a2b3c4d5e6f">/);
});

test("o fundo do html é a cor do theme-color (overscroll do iOS)", () => {
  for (const modo of ["publica", "previa"] as const) {
    const html = renderPaginaBio(dadosFalsos(), { modo, nonce: NONCE, animarEntrada: false });
    const tema = html.match(/<meta name="theme-color" content="(#[0-9A-F]{6})">/)?.[1];
    assert.ok(tema, `${modo}: a página tem theme-color`);
    const css = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? "";
    assert.ok(css.includes(`html{background:${tema}}`), `${modo}: falta html{background:${tema}} no <style>`);
  }
});

test("sem logo e sem frase: ícone vazio, sem descrição", () => {
  const html = publica(comPerfil({ logoClara: null, logoEscura: null, frase: "" }));
  assert.match(html, /<link rel="icon" href="data:,">/);
  assert.doesNotMatch(html, /name="description"|og:description|class="et-frase"/);
});

test("um h1 só: a logo dentro, com alt = nome; a frase é <p>", () => {
  const html = publica(dadosFalsos());
  assert.equal(conta(html, /<h1/g), 1);
  assert.match(html, /<h1 class="et-nome"><img class="et-logo" src="[^"]*logo-clara-falsa[^"]*"[^>]*alt="Ateliê Exemplo Kids" decoding="async"><\/h1>/);
  assert.match(html, /<p class="et-frase">Kits de roupa infantil/);
});

test("sem logo, o h1 é o nome; só a logo do fundo errado ganha placa", () => {
  assert.match(publica(comPerfil({ logoClara: null, logoEscura: null })), /<h1 class="et-nome">Ateliê Exemplo Kids<\/h1>/);
  assert.match(publica(comPerfil({ logoClara: null })), /<h1 class="et-nome"><span class="lk-placa"><img class="et-logo" src="[^"]*logo-escura-falsa/);
});

test("lista: um <li> por link visível, na ordem, com data-link e data-tipo", () => {
  const html = publica(dadosFalsos());
  assert.match(html, /<ul class="et-fio" aria-label="Links da Ateliê Exemplo Kids">/);
  const ids = [...html.matchAll(/data-link="([^"]+)" data-tipo="([a-z]+)"/g)].map((m) => `${m[2]}:${m[1]}`);
  assert.deepEqual(ids, [
    `whatsapp:${IDS.whatsapp}`,
    `link:${IDS.catalogo}`,
    `grupo:${IDS.grupo}`,
    `endereco:${IDS.endereco}`,
    `link:${IDS.canal}`,
  ]);
  assert.match(html, /<a class="et-tag et-tag--prin" href="https:\/\/wa\.me\/5562900000000\?text=Oi!%20Vim/);
  assert.match(html, /<a class="et-tag" href="\/r\/vip-exemplo" data-link/);
  assert.match(html, /<a class="et-tag" href="https:\/\/exemplo\.com\.br\/catalogo" data-link/);
});

test("some da página: desligado, linksEscondidos, grupo sem link mestre e URL javascript:", () => {
  const d = dadosFalsos();
  const links = d.documento.links.map((l) =>
    l.id === IDS.canal ? { ...l, ativo: false } : l.id === IDS.catalogo && l.tipo === "link" ? { ...l, url: "javascript:alert(1)" } : l,
  );
  const html = publica({ ...d, documento: { ...d.documento, links }, linksEscondidos: [IDS.whatsapp], campanhas: {} });
  for (const id of [IDS.canal, IDS.catalogo, IDS.whatsapp, IDS.grupo]) assert.doesNotMatch(html, new RegExp(id));
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, new RegExp(`data-link="${IDS.endereco}"`));
});

test("domínio próprio: o grupo vai para /<slug> na raiz", () => {
  const html = publica({ ...dadosFalsos(), origem: "https://links.lojaexemplo.com.br", dominioProprio: true });
  assert.match(html, /<a class="et-tag" href="\/vip-exemplo" data-link/);
});

test("endereço abre ali mesmo: <details> com foto lazy, endereço e o mapa", () => {
  const html = publica(dadosFalsos());
  assert.match(html, new RegExp(`<details class="et-abre"><summary class="et-tag" data-link="${IDS.endereco}" data-tipo="endereco">`));
  assert.match(html, /<div class="et-caminho"><img src="[^"]*fachada-falsa[^"]*"[^>]*alt="" loading="lazy" decoding="async"><address>Rua Exemplo, 100\nCentro, Cidade Exemplo<\/address><p class="et-hora">Seg a sex, das 8h às 17h<\/p><a class="et-mapa" href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Rua%20Exemplo%2C%20100%2C%20Centro%2C%20Cidade%20Exemplo">/);
});

test("o link do mapa do 'Como chegar' não tem data-link (o endereço conta só ao abrir)", () => {
  const mapa = publica(dadosFalsos()).match(/<a class="et-mapa"[^>]*>/)?.[0];
  assert.ok(mapa, "o 'Como chegar' tem o link do mapa");
  assert.doesNotMatch(mapa, /data-link/);
});

test("texto do lojista nunca vira HTML", () => {
  const d = comPerfil({ nome: '"><script>alert(1)</script>', frase: "Loja d'Ana <img src=x onerror=alert(1)>", capaAlt: '" onload="x' });
  const links = d.documento.links.map((l) => ({ ...l, titulo: "<b>x</b>", sub: "a\"b'c" }));
  const html = publica({ ...d, documento: { ...d.documento, links } });
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.doesNotMatch(html, /" onload="x/);
  assert.doesNotMatch(html, /d'Ana/);
  assert.match(html, /<title>&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/title>/);
  assert.match(html, /d(?:&#39;|&#x27;|&apos;)Ana/);
});

test("sem atributo style= em lugar nenhum", () => {
  assert.doesNotMatch(publica(dadosFalsos()), /\sstyle=/);
  assert.doesNotMatch(publica(dadosCheios()), /\sstyle=/);
});

test("<style> e <script> levam o nonce; nonce inválido não sai", () => {
  const html = publica(dadosFalsos());
  assert.match(html, /<style nonce="AAAAAAAAAAAAAAAAAAAAAA==">/);
  assert.equal(conta(html, /<script/g), 1);
  assert.match(html, /<script nonce="AAAAAAAAAAAAAAAAAAAAAA==">\(function\(\)\{/);
  const ruim = renderPaginaBio(dadosFalsos(), { modo: "publica", nonce: '"><x', animarEntrada: true });
  assert.doesNotMatch(ruim, /nonce=/);
});

test("um único role=status, fora da lista", () => {
  const html = publica(dadosFalsos());
  assert.equal(conta(html, /role="status"/g), 1);
  assert.match(html, /<\/main><p id="lk-status" class="lk-status" role="status"><\/p><\/div>/);
  assert.doesNotMatch(html, /aria-live/);
});

test("decoração fica fora da árvore de acessibilidade", () => {
  const html = publica(dadosFalsos());
  assert.match(html, /<svg class="lk-sprite" aria-hidden="true" focusable="false">/);
  assert.match(html, /<span class="et-capas" aria-hidden="true">/);
  for (const svg of html.match(/<svg class="i[^"]*"[^>]*>/g) ?? []) assert.match(svg, /aria-hidden="true"/);
});

test("prévia: sem Open Graph nem description; título e theme-color continuam", () => {
  const html = renderPaginaBio(dadosFalsos(), { modo: "previa", nonce: null, animarEntrada: false });
  assert.doesNotMatch(html, /og:|name="description"/);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<meta name="theme-color" content="#/);
  assert.match(publica(dadosFalsos()), /property="og:title"/);
});

test("prévia: nenhum <script> e nenhum href", () => {
  const html = renderPaginaBio(dadosFalsos(), { modo: "previa", nonce: null, animarEntrada: false });
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /<a [^>]*href=/);
  assert.match(html, /<a class="et-tag et-tag--prin" data-link=/);
});

test("entrada só com animarEntrada e documento.animar; o toque continua sem ela", () => {
  assert.match(publica(dadosFalsos(), true), /<div class="lk lk-entra">/);
  const parado = publica(dadosFalsos(), false);
  assert.match(parado, /<div class="lk">/);
  assert.match(parado, /\.et-tag\.lk-toque\{animation:et-balanca/);
  const d = dadosFalsos();
  assert.match(publica({ ...d, documento: { ...d.documento, animar: false } }, true), /<div class="lk">/);
});

test("capa: fetchpriority alta e alt vazio sem descrição; o resto é lazy", () => {
  const html = publica(comPerfil({ capaAlt: "" }));
  assert.match(html, /<img class="lk-f-50-30" src="[^"]*capa-falsa[^"]*" srcset="[^"]*384w[^"]*640w[^"]*828w" sizes="[^"]+" width="640" height="512" alt="" fetchpriority="high" decoding="async">/);
  assert.equal(conta(html, /fetchpriority=/g), 1);
  assert.equal(conta(html, /<img /g) - conta(html, /loading="lazy"/g), 2); // capa e logo
});

test("sem capa, o 'onde fica' sai abaixo da frase", () => {
  const html = publica(comPerfil({ capa: null }));
  assert.doesNotMatch(html, /<figure|fetchpriority=/);
  assert.match(html, /<p class="et-local"><svg[^>]*><use href="#lk-i-mapa"><\/use><\/svg><span>Loja na Rua Exemplo/);
});

test("foco da foto vira regra no <style>, nunca style=", () => {
  const html = publica(dadosFalsos());
  assert.match(html, /\.lk \.lk-f-50-30\{object-position:50% 30%;transform-origin:50% 30%\}/);
  assert.match(html, /<img class="lk-f-38-20" src="[^"]*kit-2-falso/);
});

test("rodapé: Instagram, CNPJ só com o confere ligado, Feito com Girumo desligável", () => {
  const html = publica(dadosFalsos());
  assert.match(html, /<footer class="et-rodape"><span>Instagram @atelie\.exemplo<\/span><small>Ateliê Exemplo Kids · CNPJ 11\.222\.333\/0001-81<\/small><a class="lk-feito"/);
  const selo = `<a class="lk-feito" href="${getPublicSiteUrl()}/?utm_source=link-da-bio&amp;utm_medium=rodape">`;
  assert.ok(html.includes(selo));
  assert.ok(publica({ ...dadosFalsos(), origem: "https://links.lojaexemplo.com.br", dominioProprio: true }).includes(selo));
  const d = dadosFalsos();
  const sem = publica({ ...d, documento: { ...d.documento, feitoComGirumo: false, confere: { ...d.documento.confere, ativo: false } } });
  assert.doesNotMatch(sem, /class="lk-feito"|Feito com Girumo|<small>/);
});

test("página recém-criada (documentoPadrao) abre sem elemento vazio", () => {
  const d: DadosRender = { ...dadosFalsos(), documento: documentoPadrao({ nome: "Loja Nova", campanhaId: IDS.campanha }) };
  const html = publica(d);
  assert.match(html, /<h1 class="et-nome">Loja Nova<\/h1>/);
  assert.match(html, /href="\/r\/vip-exemplo"/);
  assert.doesNotMatch(html, /<(p|ul|h1|figure|footer|section) class="[^"]*"><\/\1>/);
  const vazia = publica({ ...d, documento: documentoPadrao({ nome: "Loja Nova", campanhaId: null }) });
  assert.doesNotMatch(vazia, /<ul class="et-fio"/);
});

test("todos os links escondidos: nenhuma lista vazia", () => {
  const d = dadosFalsos();
  const html = publica({ ...d, linksEscondidos: d.documento.links.map((l) => l.id) });
  assert.doesNotMatch(html, /<ul class="et-fio"/);
  assert.match(html, /<h1 class="et-nome">/);
});

test("página cheia (20 links no limite) cabe em 40 KB", () => {
  const html = publica(dadosCheios());
  assert.equal(conta(html, /data-link=/g), 20);
  const bytes = Buffer.byteLength(html);
  assert.ok(bytes <= 40 * 1024, `${bytes} bytes`);
});

test("404: mínima, sem marca e sem script", () => {
  const html = renderPaginaNaoEncontrada(NONCE);
  assert.match(html, /<title>Página não encontrada<\/title>/);
  assert.match(html, /<h1>Página não encontrada<\/h1>/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<style nonce="AAAAAAAAAAAAAAAAAAAAAA==">/);
  assert.doesNotMatch(html, /girumo|<script|\sstyle=/i);
  assert.doesNotMatch(renderPaginaNaoEncontrada(null), /nonce=/);
});

test("o renderizador é puro: sem server-only, Supabase, React nem node:", () => {
  const pasta = path.dirname(fileURLToPath(import.meta.url));
  const fontes = readdirSync(pasta).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  assert.ok(fontes.length >= 5);
  for (const f of fontes) {
    const src = readFileSync(path.join(pasta, f), "utf8");
    assert.doesNotMatch(src, /from "(?:server-only|@supabase\/[^"]+|react|react-dom[^"]*|node:[^"]+)"|import "server-only"/, f);
  }
});

test("ordem: o script vem depois do #lk-status e o CSS_BASE antes do CSS do modelo", () => {
  const html = publica(dadosFalsos());
  assert.ok(html.indexOf('id="lk-status"') < html.indexOf("<script"));
  assert.ok(html.indexOf(CSS_BASE) >= 0 && html.indexOf(CSS_BASE) < html.indexOf(CSS_ETIQUETA));
});
