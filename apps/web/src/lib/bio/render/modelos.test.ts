import assert from "node:assert/strict";
import { test } from "node:test";

import { MODELOS, PALETAS, documentoPadrao, type DadosRender, type Modelo } from "@/lib/bio/documento";
import { IDS, dadosCheios, dadosFalsos, dadosPiorCaso } from "@/test/bio-dados-falsos";
import { renderPaginaBio } from "./index";

/** O que vale para todo modelo (spec §10 e §11), na primeira paleta de cada um. */
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const NOME = "Ateliê Exemplo Kids";
const no = (modelo: Modelo, d: DadosRender = dadosFalsos()): DadosRender => ({
  ...d,
  documento: { ...d.documento, modelo, paleta: PALETAS[modelo][0] },
});
const publica = (d: DadosRender) => renderPaginaBio(d, { modo: "publica", nonce: NONCE, animarEntrada: true });
const conta = (html: string, re: RegExp) => html.match(re)?.length ?? 0;
/**
 * O quanto o JS do Pixel + GA4 pode crescer (3072 B do teto da spec §11 − 1187 B do JS
 * sem rastreio): o pior caso SEM rastreio tem de deixar esse espaço. A Task 2 do PR 7
 * acrescenta o teste do pior caso com os dois rastreadores ≤ 40 KB.
 */
const FOLGA_DO_RASTREIO = 1885;

for (const modelo of MODELOS) {
  test(`${modelo}: um h1 com o nome (ou a logo com alt = nome), um role=status fora da lista, decoração com aria-hidden`, () => {
    const html = publica(no(modelo));
    assert.equal(conta(html, /<h1/g), 1);
    const h1 = /<h1 class="[^"]+">([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "";
    assert.ok(h1 === NOME || new RegExp(`^(?:<span class="lk-placa[^"]*">)?<img [^>]*alt="${NOME}"`).test(h1), h1);
    assert.equal(conta(html, /role="status"/g), 1);
    assert.match(html, /<\/main><p id="lk-status" class="lk-status" role="status"><\/p><\/div>/);
    assert.match(html, /<meta name="theme-color" content="#[0-9A-F]{6}">/);
    for (const svg of html.match(/<svg class="i[^"]*"[^>]*>/g) ?? []) assert.match(svg, /aria-hidden="true"/);
  });

  test(`${modelo}: um item por link visível, na ordem, com data-link e data-tipo`, () => {
    const html = publica(no(modelo));
    assert.match(html, new RegExp(`<ul class="[a-z-]+" aria-label="Links da ${NOME}">`));
    const ids = [...html.matchAll(/data-link="([^"]+)" data-tipo="([a-z]+)"/g)].map((m) => `${m[2]}:${m[1]}`);
    assert.deepEqual(ids, [
      `whatsapp:${IDS.whatsapp}`,
      `link:${IDS.catalogo}`,
      `grupo:${IDS.grupo}`,
      `endereco:${IDS.endereco}`,
      `link:${IDS.canal}`,
    ]);
    assert.match(html, new RegExp(`<summary class="[a-z-]+" data-link="${IDS.endereco}" data-tipo="endereco">`));
    assert.match(html, /href="\/r\/vip-exemplo" data-link/);
    assert.match(html, /<button type="button" class="[a-z]+-copiar" data-copiar="11222333000181">Copiar CNPJ<\/button>/);
  });

  test(`${modelo}: texto do lojista nunca vira HTML, em campo nenhum`, () => {
    const d = no(modelo);
    const MAL = `"><script>alert(1)</script><b>x</b>'<img src=x onerror=y>`;
    const perfil = { ...d.documento.perfil, nome: MAL, frase: MAL, destaques: [MAL, MAL], local: MAL, instagram: MAL, capaAlt: MAL };
    const confere = { ativo: true, razao: MAL, cnpj: "11222333000181", linhas: [MAL, MAL] };
    const links = d.documento.links.map((l) =>
      l.tipo === "endereco" ? { ...l, titulo: MAL, sub: MAL, endereco: MAL, horario: MAL } : { ...l, titulo: MAL, sub: MAL },
    );
    const html = publica({ ...d, documento: { ...d.documento, perfil, confere, links } });
    assert.doesNotMatch(html, /<script>alert|<b>x<\/b>|<img src=x|'<img|"><script/);
  });

  test(`${modelo}: sem style=, com nonce; a prévia não tem <script> nem href`, () => {
    const html = publica(no(modelo));
    assert.doesNotMatch(html, /\sstyle=/);
    assert.doesNotMatch(publica(no(modelo, dadosCheios())), /\sstyle=/);
    assert.match(html, /<style nonce="AAAAAAAAAAAAAAAAAAAAAA==">/);
    assert.equal(conta(html, /<script/g), 1);
    const previa = renderPaginaBio(no(modelo), { modo: "previa", nonce: null, animarEntrada: false });
    assert.doesNotMatch(previa, /<script/);
    assert.doesNotMatch(previa, /<a [^>]*href=/);
    assert.match(previa, /<a class="[^"]+" data-link=/);
  });

  test(`${modelo}: desligado, escondido e sem destino somem; todos escondidos = nenhuma lista`, () => {
    const d = no(modelo);
    const links = d.documento.links.map((l) =>
      l.id === IDS.canal ? { ...l, ativo: false } : l.id === IDS.catalogo && l.tipo === "link" ? { ...l, url: "javascript:alert(1)" } : l,
    );
    const html = publica({ ...d, documento: { ...d.documento, links }, linksEscondidos: [IDS.whatsapp], campanhas: {} });
    for (const id of [IDS.canal, IDS.catalogo, IDS.whatsapp, IDS.grupo]) assert.doesNotMatch(html, new RegExp(id));
    assert.doesNotMatch(html, /javascript:/);
    const vazia = publica({ ...d, linksEscondidos: d.documento.links.map((l) => l.id) });
    assert.doesNotMatch(vazia, /aria-label="Links da/);
    assert.match(vazia, /<h1/);
  });

  test(`${modelo}: página recém-criada (documentoPadrao) abre sem elemento vazio`, () => {
    const d = no(modelo, { ...dadosFalsos(), documento: documentoPadrao({ nome: "Loja Nova", campanhaId: IDS.campanha }) });
    const html = publica(d);
    assert.match(html, /<h1 class="[^"]+">Loja Nova<\/h1>/);
    assert.match(html, /href="\/r\/vip-exemplo"/);
    assert.doesNotMatch(html, /<(p|ul|h1|figure|footer|section|header|div|article) class="[^"]*"><\/\1>/);
  });

  test(`${modelo}: página cheia (20 links no limite) cabe em 40 KB`, () => {
    const html = publica(no(modelo, dadosCheios()));
    assert.equal(conta(html, /data-link=/g), 20);
    const bytes = Buffer.byteLength(html);
    assert.ok(bytes <= 40 * 1024, `${bytes} bytes`);
  });

  for (const paleta of PALETAS[modelo]) {
    test(`${modelo}: pior caso cabe em 40 KB (${paleta})`, () => {
      const html = publica({ ...dadosPiorCaso(), documento: { ...dadosPiorCaso().documento, modelo, paleta } });
      const bytes = Buffer.byteLength(html);
      assert.ok(bytes <= 40 * 1024 - FOLGA_DO_RASTREIO, `${modelo}/${paleta}: ${bytes} bytes`);
    });
  }

  for (const paleta of PALETAS[modelo]) {
    test(`${modelo}: pior caso com Pixel e GA4 cabe em 40 KB (${paleta})`, () => {
      const d = dadosPiorCaso();
      const documento = { ...d.documento, modelo, paleta, rastreio: { metaPixelId: "1234567890", ga4Id: "G-TESTE12345" } };
      const bytes = Buffer.byteLength(publica({ ...d, documento }));
      assert.ok(bytes <= 40 * 1024, `${modelo}/${paleta}: ${bytes} bytes`);
    });
  }
}
