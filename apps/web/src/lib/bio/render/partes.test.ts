import assert from "node:assert/strict";
import { test } from "node:test";

import type { DadosRender, LinkBio } from "@/lib/bio/documento";
import { IDS, dadosFalsos, documentoFalso } from "@/test/bio-dados-falsos";
import type { ContextoRender } from "./modelo";
import {
  CSS_BASE,
  atrasos,
  blocoConfere,
  classeDoFoco,
  cnpjDaLoja,
  conteudoDoH1,
  destaqueEmPartes,
  destaqueHtml,
  detalhesDoEndereco,
  feitoComGirumo,
  formatarCnpj,
  hrefAttr,
  hrefDoLink,
  icone,
  imagem,
  LARGURA_MINIATURA,
  linksVisiveis,
  logoDaPagina,
  pontoDoFoco,
  regrasDoFoco,
  sprite,
  tokensValidos,
  urlDaImagem,
} from "./partes";

const link = (id: string): LinkBio => {
  const achado = dadosFalsos().documento.links.find((l) => l.id === id);
  assert.ok(achado);
  return achado;
};

test("imagem: srcset 384/640/828 pelo otimizador, src de 640, & escapado", () => {
  const html = imagem({ id: "capa-falsa", foco: null }, { largura: 640, altura: 512, sizes: "100vw", alt: "Fachada", carregamento: "prioridade" });
  assert.match(html, /src="\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Fcapa-falsa&amp;w=640&amp;q=75"/);
  assert.match(html, /srcset="[^"]*w=384&amp;q=75 384w, [^"]*w=640&amp;q=75 640w, [^"]*w=828&amp;q=75 828w"/);
  assert.match(html, /sizes="100vw" width="640" height="512" alt="Fachada" fetchpriority="high" decoding="async">/);
  assert.doesNotMatch(html, /loading=/);
});

test("imagem: miniatura com uma largura só, lazy, sem srcset", () => {
  const html = imagem({ id: "kit", foco: null }, { largura: 32, altura: 42, sizes: "32px", alt: "", carregamento: "lazy", larguras: [128] });
  assert.match(html, /src="[^"]*w=128&amp;q=75"/);
  assert.doesNotMatch(html, /srcset|sizes=/);
  assert.match(html, /alt="" loading="lazy"/);
});

test("imagem: id fora do formato não vira <img>", () => {
  assert.equal(imagem({ id: "../x", foco: null }, { largura: 1, altura: 1, sizes: "1px", alt: "", carregamento: "lazy" }), "");
  assert.equal(urlDaImagem('a"b', 384), null);
});

test("foco: porcentagem inteira, classe e regra com object-position e transform-origin", () => {
  assert.deepEqual(pontoDoFoco({ x: 0.375, y: 0.2 }), { x: 38, y: 20 });
  assert.deepEqual(pontoDoFoco({ x: 7, y: -1 }), { x: 100, y: 0 });
  assert.equal(pontoDoFoco(null), null);
  assert.equal(pontoDoFoco({ x: Number.NaN, y: 0.5 }), null);
  assert.equal(classeDoFoco({ x: 0.375, y: 0.2 }), "lk-f-38-20");
  assert.equal(classeDoFoco(null), "");
  const regras = regrasDoFoco(documentoFalso());
  assert.match(regras, /\.lk \.lk-f-38-20\{object-position:38% 20%;transform-origin:38% 20%\}/);
  assert.match(regras, /\.lk \.lk-f-50-30\{object-position:50% 30%;transform-origin:50% 30%\}/);
  assert.equal(regras.match(/lk-f-/g)?.length, 2);
});

test("ícone decorativo e sprite só com o que a página usa", () => {
  assert.equal(icone("coroa"), '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><use href="#lk-i-coroa"></use></svg>');
  assert.match(icone("nao-existe"), /#lk-i-link/);
  const s = sprite(`${icone("coroa")}${icone("seta", "i et-seta")}${icone("coroa")}`);
  assert.match(s, /^<svg class="lk-sprite" aria-hidden="true" focusable="false">/);
  assert.equal(s.match(/<symbol /g)?.length, 2);
  assert.match(s, /id="lk-i-coroa"/);
  assert.equal(sprite("<p>sem ícone</p>"), "");
  assert.equal(sprite("#lk-i-constructor"), "");
});

test("destaque: só o primeiro número (ou R$) vai em <b>", () => {
  assert.deepEqual(destaqueEmPartes("a partir de R$ 19,90 a peça"), { antes: "a partir de ", num: "R$ 19,90", depois: " a peça" });
  assert.deepEqual(destaqueEmPartes("12 kits no catálogo"), { antes: "", num: "12", depois: " kits no catálogo" });
  assert.deepEqual(destaqueEmPartes("frete grátis acima de 1.000."), { antes: "frete grátis acima de ", num: "1.000", depois: "." });
  assert.deepEqual(destaqueEmPartes("envio pro Brasil inteiro"), { antes: "envio pro Brasil inteiro", num: "", depois: "" });
  assert.equal(destaqueHtml("<b>3</b> kits"), "&lt;b&gt;<b>3</b>&lt;/b&gt; kits");
});

test("CNPJ: numérico ou alfanumérico com pontuação; o resto volta como veio", () => {
  assert.equal(formatarCnpj("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatarCnpj("12ABC34501DE35"), "12.ABC.345/01DE-35");
  assert.equal(formatarCnpj("123"), "123");
});

test("logo: a certa para o fundo; só a errada vai numa placa", () => {
  const doc = documentoFalso();
  const escuro = "#286AA6";
  const claro = "#F4F7FB";
  assert.deepEqual(logoDaPagina(doc, escuro), { midia: doc.perfil.logoClara, placa: null });
  assert.deepEqual(logoDaPagina(doc, claro), { midia: doc.perfil.logoEscura, placa: null });
  const soEscura = { ...doc, perfil: { ...doc.perfil, logoClara: null } };
  assert.deepEqual(logoDaPagina(soEscura, escuro), { midia: doc.perfil.logoEscura, placa: "clara" });
  const soClara = { ...doc, perfil: { ...doc.perfil, logoEscura: null } };
  assert.deepEqual(logoDaPagina(soClara, claro), { midia: doc.perfil.logoClara, placa: "escura" });
  const semLogo = { ...doc, perfil: { ...doc.perfil, logoClara: null, logoEscura: null } };
  assert.equal(logoDaPagina(semLogo, escuro), null);
});

test("tokens: só --nome com #RRGGBB vão para o <style>", () => {
  assert.deepEqual(
    tokensValidos({ "--fundo1": "#3a80bf", on: "#FFFFFF", "--x": "red", "--y": "#FFF;}body{x:1", "--Z": "#000000" }),
    { "--fundo1": "#3A80BF", "--on": "#FFFFFF" },
  );
});

test("atrasos de entrada por :nth-child, até 20 links", () => {
  const css = atrasos(".x>li", 0, 70);
  assert.doesNotMatch(css, /nth-child\(1\)/);
  assert.match(css, /\.x>li:nth-child\(2\)\{animation-delay:70ms\}/);
  assert.match(css, /\.x>li:nth-child\(20\)\{animation-delay:1330ms\}/);
  assert.doesNotMatch(css, /nth-child\(21\)/);
  assert.match(atrasos(".y>li", 350, 60), /\.y>li:nth-child\(1\)\{animation-delay:350ms\}/);
});

test("WhatsApp: wa.me com a mensagem codificada; sem mensagem, sem ?text", () => {
  const d = dadosFalsos();
  const zap = link(IDS.whatsapp);
  assert.equal(hrefDoLink(zap, d), "https://wa.me/5562900000000?text=Oi!%20Vim%20pelo%20Instagram%20e%20quero%20ver%20os%20kits.");
  assert.equal(hrefDoLink({ ...zap, mensagem: "" } as LinkBio, d), "https://wa.me/5562900000000");
  assert.equal(hrefDoLink({ ...zap, numero: "62900000000" } as LinkBio, d), null);
  assert.equal(
    hrefDoLink({ ...zap, mensagem: "Kit #3 & tchau 😀" } as LinkBio, d),
    "https://wa.me/5562900000000?text=Kit%20%233%20%26%20tchau%20%F0%9F%98%80",
  );
});

test("grupo: /r/<slug> no host Girumo, /<slug> no domínio próprio; campanha sumida some", () => {
  const d = dadosFalsos();
  const grupo = link(IDS.grupo);
  assert.equal(hrefDoLink(grupo, d), "/r/vip-exemplo");
  assert.equal(hrefDoLink(grupo, { ...d, origem: "https://links.lojaexemplo.com.br", dominioProprio: true }), "/vip-exemplo");
  assert.equal(hrefDoLink(grupo, { ...d, campanhas: {} }), null);
  assert.equal(hrefDoLink({ ...grupo, campanhaId: "__proto__" } as LinkBio, d), null);
  assert.equal(hrefDoLink(grupo, { ...d, campanhas: { [IDS.campanha]: "../x" } }), null);
});

test("link: só http/https com host de verdade, emitido como url.href", () => {
  const d = dadosFalsos();
  const base = link(IDS.catalogo);
  const com = (url: string) => hrefDoLink({ ...base, url } as LinkBio, d);
  assert.equal(com("https://exemplo.com.br/a b"), "https://exemplo.com.br/a%20b");
  assert.equal(com("javascript:alert(1)"), null);
  assert.equal(com("data:text/html,oi"), null);
  assert.equal(com("ftp://exemplo.com.br"), null);
  assert.equal(com("https://localhost/x"), null);
  assert.equal(com("não é url"), null);
});

test("link com usuário ou senha na URL some (o host de verdade é o depois do @)", () => {
  const d = dadosFalsos();
  const com = (url: string) => hrefDoLink({ ...link(IDS.catalogo), url } as LinkBio, d);
  assert.equal(com("https://loja.com.br@evil.com/x"), null);
  assert.equal(com("https://a:b@evil.com"), null);
});

test("endereço: Google Maps com o endereço numa linha", () => {
  assert.equal(
    hrefDoLink(link(IDS.endereco), dadosFalsos()),
    "https://www.google.com/maps/search/?api=1&query=Rua%20Exemplo%2C%20100%2C%20Centro%2C%20Cidade%20Exemplo",
  );
});

test("links visíveis: desligado, escondido e sem destino somem; um principal só, nunca o endereço", () => {
  const d = dadosFalsos();
  const links = d.documento.links.map((l) =>
    l.id === IDS.canal ? { ...l, ativo: false } : l.tipo === "link" ? { ...l, destaque: true } : l,
  );
  const dados: DadosRender = { ...d, documento: { ...d.documento, links }, linksEscondidos: [IDS.grupo] };
  const v = linksVisiveis(dados);
  assert.deepEqual(v.map((x) => x.link.id), [IDS.whatsapp, IDS.catalogo, IDS.endereco]);
  assert.deepEqual(v.map((x) => x.principal), [true, false, false]);
  const semGrupo = linksVisiveis({ ...d, campanhas: {} });
  assert.ok(!semGrupo.some((x) => x.link.id === IDS.grupo));
});

test("prévia não leva href; a pública escapa o destino", () => {
  assert.equal(hrefAttr("https://a.com.br/?x=1&y=2", "previa"), "");
  assert.equal(hrefAttr("https://a.com.br/?x=1&y=2", "publica"), ' href="https://a.com.br/?x=1&amp;y=2"');
});

test("confere: Pix com Copiar CNPJ só com razão e CNPJ; linhas com ✓; nada sem conteúdo", () => {
  const doc = documentoFalso();
  const html = blocoConfere(doc, "et");
  assert.match(html, /^<section class="et-confere" aria-labelledby="lk-confere"><h2 id="lk-confere">Antes de pagar, confere<\/h2>/);
  assert.match(html, /O Pix cai só no nome <b>Ateliê Exemplo Comércio de Roupas Ltda<\/b>\./);
  assert.match(html, /<span>CNPJ 11\.222\.333\/0001-81<\/span><button type="button" class="et-copiar" data-copiar="11222333000181">Copiar CNPJ<\/button>/);
  assert.equal(html.match(/#lk-i-check/g)?.length, 2);
  assert.equal(blocoConfere({ ...doc, confere: { ...doc.confere, ativo: false } }, "et"), "");
  assert.doesNotMatch(blocoConfere({ ...doc, confere: { ...doc.confere, razao: "" } }, "et"), /data-copiar/);
  assert.equal(blocoConfere({ ...doc, confere: { ativo: true, razao: "", cnpj: "", linhas: [] } }, "et"), "");
});

test("h1, endereço e selo saem do contexto: logo ou nome, <details> e selo sem href na prévia", () => {
  const d = dadosFalsos();
  const ctx = (o: Partial<ContextoRender>): ContextoRender => ({ d, modo: "publica", tokens: {}, links: linksVisiveis(d), logo: null, ...o });
  const tam = { classe: "et-logo", largura: 190, altura: 84, sizes: "190px" };
  assert.equal(conteudoDoH1(ctx({}), tam), "Ateliê Exemplo Kids");
  const logo = { midia: { id: "logo-x", foco: null }, placa: "escura" as const };
  assert.match(conteudoDoH1(ctx({ logo }), tam), /^<span class="lk-placa lk-placa--escura"><img class="et-logo" src="[^"]*logo-x[^"]*"[^>]*alt="Ateliê Exemplo Kids" decoding="async"><\/span>$/);
  const endereco = ctx({}).links.find((v) => v.link.tipo === "endereco");
  assert.ok(endereco);
  const det = detalhesDoEndereco(endereco, ctx({ modo: "previa" }), { prefixo: "x", classeDoResumo: "x-tag", resumo: "R", foto: { largura: 640, altura: 480, sizes: "100vw" }, mapa: "Mapa →" });
  assert.match(det, /^<details class="x-abre"><summary class="x-tag" data-link="[^"]+" data-tipo="endereco">R<\/summary><div class="x-caminho"><img /);
  assert.match(det, /<a class="x-mapa">Mapa →<\/a><\/div><\/details>$/);
  assert.match(feitoComGirumo(ctx({ modo: "previa" })), /^<a class="lk-feito"><svg/);
  assert.equal(feitoComGirumo(ctx({ d: { ...d, documento: { ...d.documento, feitoComGirumo: false } } })), "");
});

test("CSS base: foco visível, alvo de 44 px no selo e movimento reduzido desliga tudo", () => {
  assert.match(CSS_BASE, /\.lk :focus-visible\{outline:3px solid var\(--foco\);outline-offset:3px\}/);
  assert.match(CSS_BASE, /\.lk-feito\{[^}]*min-height:44px/);
  assert.match(CSS_BASE, /@media \(prefers-reduced-motion:reduce\)\{\.lk \*,\.lk \*::before,\.lk \*::after\{animation:none!important;transition:none!important\}\}/);
  assert.match(CSS_BASE, /\.lk-status:empty\{/);
});

test("cnpjDaLoja: formatado só com o confere ligado e 14 dígitos", () => {
  const doc = documentoFalso();
  assert.equal(cnpjDaLoja(doc), "11.222.333/0001-81");
  assert.equal(cnpjDaLoja({ ...doc, confere: { ...doc.confere, ativo: false } }), "");
  assert.equal(cnpjDaLoja({ ...doc, confere: { ...doc.confere, cnpj: "" } }), "");
});

test("ícone, sprite e grupo não leem o protótipo (sem Object.hasOwn: a prévia roda no Safari < 15.4)", () => {
  for (const nome of ["toString", "constructor", "__proto__"]) {
    assert.match(icone(nome), /href="#lk-i-link"/, nome);
  }
  assert.equal(sprite('<use href="#lk-i-constructor"></use>'), "");
  const d = dadosFalsos();
  assert.equal(hrefDoLink({ ...link(IDS.grupo), campanhaId: "constructor" } as LinkBio, d), null);
});

test("foco: link desligado não gera regra; ligado gera (as mídias do perfil sempre)", () => {
  const doc = documentoFalso();
  const foto = { id: "kit-x-falso", foco: { x: 0.1, y: 0.2 } };
  const comFoto = (ativo: boolean) => ({
    ...doc,
    links: doc.links.map((l) => (l.tipo === "link" && l.id === IDS.catalogo ? { ...l, ativo, fotos: [foto] } : l)),
  });
  assert.doesNotMatch(regrasDoFoco(comFoto(false)), /lk-f-10-20/);
  assert.match(regrasDoFoco(comFoto(true)), /\.lk-f-10-20\{/);
  const capa = { ...doc, perfil: { ...doc.perfil, capa: { id: "capa-falsa", foco: { x: 0.9, y: 0.9 } } } };
  assert.match(regrasDoFoco(capa), /\.lk-f-90-90\{/);
});

test("imagem: carregamento normal não leva fetchpriority nem loading", () => {
  const html = imagem({ id: "logo-falsa", foco: null }, { largura: 190, altura: 84, sizes: "190px", alt: "Loja", carregamento: "normal" });
  assert.doesNotMatch(html, /fetchpriority|loading=/);
  assert.match(html, /decoding="async">$/);
});

test("imagem: LARGURA_MINIATURA como larguras gera só a largura dela", () => {
  const html = imagem({ id: "kit", foco: null }, { largura: 32, altura: 42, sizes: "32px", alt: "", carregamento: "lazy", larguras: LARGURA_MINIATURA });
  assert.match(html, /src="[^"]*w=128&amp;q=75"/);
  assert.doesNotMatch(html, /w=384|w=640|w=828|srcset/);
});

test("logo: fundo que não é #RRGGBB conta como claro (usa a logoEscura, sem placa)", () => {
  const doc = documentoFalso();
  for (const fundo of ["azul", "#FFF", "", "rgb(0,0,0)"]) {
    assert.deepEqual(logoDaPagina(doc, fundo), { midia: doc.perfil.logoEscura, placa: null }, fundo);
  }
});
