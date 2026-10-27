import assert from "node:assert/strict";
import { test } from "node:test";

import { IDS, dadosCheios, dadosFalsos } from "@/test/bio-dados-falsos";
import { renderPaginaBio } from "./index";
import { scriptDaPagina } from "./script";

const JS = scriptDaPagina({ rastreio: null });

type Ouvinte = (e: unknown) => void;

/** Roda o script com um DOM falso: só o que ele usa (status, clique, pageshow, área de transferência, beacon, timers). */
function monta(clipboard: "ok" | "falha" | "sem" = "ok", comBeacon = true, pagina: string | null = IDS.pagina) {
  const status = { textContent: "" };
  const ouvintes: Record<string, Ouvinte> = {};
  const copiados: string[] = [];
  const beacons: [string, string][] = [];
  // Relógio falso, começa em 0: o setTimeout devolve um id e guarda o vencimento; o clearTimeout cancela o id.
  let agora = 0;
  let ultimoId = 0;
  const timers = new Map<number, { vence: number; fn: () => void }>();
  const navegador: Record<string, unknown> = {};
  if (clipboard !== "sem") {
    navegador.clipboard = {
      writeText: (t: string) => {
        copiados.push(t);
        return clipboard === "ok" ? Promise.resolve() : Promise.reject(new Error("negado"));
      },
    };
  }
  if (comBeacon) {
    // `function` de propósito: o teste confere o `this`. No navegador, o sendBeacon
    // chamado fora do navigator (`var b = navigator.sendBeacon; b(…)`) dá "Illegal invocation".
    navegador.sendBeacon = function (this: unknown, url: string, corpo: string) {
      assert.equal(this, navegador, "sendBeacon chamado fora do navigator");
      beacons.push([url, corpo]);
      return true;
    };
  }
  const documento = {
    body: { getAttribute: (n: string) => (n === "data-pagina" ? pagina : null) },
    getElementById: (id: string) => (id === "lk-status" ? status : null),
    addEventListener: (tipo: string, fn: Ouvinte) => {
      ouvintes[tipo] = fn;
    },
  };
  new Function("document", "navigator", "addEventListener", "setTimeout", "clearTimeout", JS)(
    documento,
    navegador,
    (tipo: string, fn: Ouvinte) => {
      ouvintes[`janela:${tipo}`] = fn;
    },
    (fn: () => void, ms = 0) => {
      ultimoId += 1;
      timers.set(ultimoId, { vence: agora + ms, fn });
      return ultimoId;
    },
    (id: number) => timers.delete(id),
  );
  /** Roda, em ordem de vencimento, os timers que vencem até `ate` (e os que eles agendarem no caminho). */
  const roda = (ate: number) => {
    for (;;) {
      const [proximo] = [...timers].filter(([, x]) => x.vence <= ate).sort(([, a], [, b]) => a.vence - b.vence);
      if (!proximo) return;
      const [id, { vence, fn }] = proximo;
      timers.delete(id);
      agora = vence;
      fn();
    }
  };
  /** Roda todos os setTimeout pendentes, sem olhar o vencimento. */
  const passa = () => roda(Infinity);
  /** Anda o relógio `ms` e roda, em ordem de vencimento, só os timers vencidos. */
  const avanca = (ms: number) => {
    const ate = agora + ms;
    roda(ate);
    agora = ate;
  };
  return { status, ouvintes, copiados, beacons, passa, avanca };
}

function elemento(attrs: Record<string, string>, extra: { tagName?: string; parentNode?: { open: boolean } } = {}) {
  const classes = new Set<string>();
  const el = {
    textContent: "Copiar CNPJ",
    offsetWidth: 0,
    tagName: "A",
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
    closest: (): unknown => el,
    ...extra,
  };
  return { el, classes };
}

const tique = () => new Promise((r) => setImmediate(r));

test("cabe em 3 KB e não tem '<' (nunca fecha o <script>)", () => {
  assert.ok(Buffer.byteLength(JS) <= 3 * 1024, `${Buffer.byteLength(JS)} bytes`);
  assert.doesNotMatch(JS, /</);
});

test("toque no WhatsApp: 'Abrindo o WhatsApp…' no status e a classe do balanço", () => {
  const { status, ouvintes } = monta();
  const { el, classes } = elemento({ "data-link": "x", "data-tipo": "whatsapp" });
  ouvintes.click({ target: el });
  assert.equal(status.textContent, "Abrindo o WhatsApp…");
  assert.ok(classes.has("lk-toque"));
});

test("grupo e link dizem o que abrem; endereço só balança", () => {
  const casos: [string, string][] = [["grupo", "Abrindo o grupo…"], ["link", "Abrindo…"], ["endereco", ""], ["constructor", ""]];
  for (const [tipo, esperado] of casos) {
    const { status, ouvintes } = monta();
    const { el, classes } = elemento({ "data-link": "x", "data-tipo": tipo });
    ouvintes.click({ target: el });
    assert.equal(status.textContent, esperado, tipo);
    assert.ok(classes.has("lk-toque"), tipo);
  }
});

test("clique fora de botão não faz nada", () => {
  const { status, ouvintes } = monta();
  ouvintes.click({ target: { closest: () => null } });
  ouvintes.click({ target: null });
  assert.equal(status.textContent, "");
});

test("Copiar CNPJ: 'Copiado' só quando o writeText resolve", async () => {
  const ok = monta("ok");
  const botao = elemento({ "data-copiar": "11222333000181" });
  ok.ouvintes.click({ target: botao.el });
  await tique();
  assert.deepEqual(ok.copiados, ["11222333000181"]);
  assert.equal(botao.el.textContent, "Copiado");
  assert.equal(ok.status.textContent, "CNPJ copiado.");
  assert.ok(!botao.classes.has("lk-toque"));
  ok.passa();
  assert.equal(botao.el.textContent, "Copiar CNPJ");
  assert.equal(ok.status.textContent, "");

  const negado = monta("falha");
  const outro = elemento({ "data-copiar": "11222333000181" });
  negado.ouvintes.click({ target: outro.el });
  await tique();
  assert.equal(outro.el.textContent, "Copiar CNPJ");
  assert.equal(negado.status.textContent, "Não foi possível copiar o CNPJ.");

  const sem = monta("sem");
  const terceiro = elemento({ "data-copiar": "11222333000181" });
  sem.ouvintes.click({ target: terceiro.el });
  await tique();
  assert.equal(terceiro.el.textContent, "Copiar CNPJ");
  assert.equal(sem.status.textContent, "Não foi possível copiar o CNPJ.");
  assert.ok(!terceiro.classes.has("lk-toque"));
  assert.deepEqual(sem.beacons, []);
});

test("Copiar CNPJ duas vezes: o 'Copiado' dura 2,2 s a partir do último toque", async () => {
  const { ouvintes, avanca } = monta("ok");
  const { el } = elemento({ "data-copiar": "11222333000181" });
  ouvintes.click({ target: el });
  await tique();
  avanca(1000);
  ouvintes.click({ target: el });
  await tique();
  avanca(1500); // 2,5 s do primeiro toque, 1,5 s do segundo
  assert.equal(el.textContent, "Copiado");
  avanca(1000); // 2,5 s do segundo
  assert.equal(el.textContent, "Copiar CNPJ");
});

test("voltar para a página (pageshow) limpa o status", () => {
  const { status, ouvintes } = monta();
  ouvintes.click({ target: elemento({ "data-link": "x", "data-tipo": "link" }).el });
  assert.equal(status.textContent, "Abrindo…");
  ouvintes["janela:pageshow"]({});
  assert.equal(status.textContent, "");
});

/** O corpo que o servidor espera (toque.ts): `{"p":<página>,"l":<link>}`. */
const corpoDoToque = (l: string) => `{"p":"${IDS.pagina}","l":"${l}"}`;

test("toque num botão manda o beacon {p, l} pro /api/p/bio/toque, sem segurar a navegação", () => {
  const { ouvintes, beacons } = monta();
  let segurou = false;
  const { el } = elemento({ "data-link": IDS.whatsapp, "data-tipo": "whatsapp" });
  ouvintes.click({
    target: el,
    preventDefault: () => {
      segurou = true;
    },
  });
  assert.deepEqual(beacons, [["/api/p/bio/toque", corpoDoToque(IDS.whatsapp)]]);
  assert.equal(segurou, false, "preventDefault seguraria a ida pro WhatsApp");
});

test("endereço: o beacon sai quando o <details> abre, não quando fecha", () => {
  const { ouvintes, beacons } = monta();
  // No clique o `open` ainda é o de antes: o navegador só abre ou fecha depois dos ouvintes.
  const detalhes = { open: false };
  const { el } = elemento({ "data-link": IDS.endereco, "data-tipo": "endereco" }, { tagName: "SUMMARY", parentNode: detalhes });
  ouvintes.click({ target: el }); // abre
  detalhes.open = true;
  ouvintes.click({ target: el }); // fecha
  detalhes.open = false;
  ouvintes.click({ target: el }); // abre de novo
  assert.deepEqual(beacons, [
    ["/api/p/bio/toque", corpoDoToque(IDS.endereco)],
    ["/api/p/bio/toque", corpoDoToque(IDS.endereco)],
  ]);
});

test("Copiar CNPJ e clique fora de botão não mandam beacon", () => {
  const { ouvintes, beacons } = monta();
  ouvintes.click({ target: elemento({ "data-copiar": "11222333000181" }).el });
  ouvintes.click({ target: { closest: () => null } });
  assert.deepEqual(beacons, []);
});

test("navegador sem sendBeacon: o toque segue igual (status e balanço), sem erro", () => {
  const { status, ouvintes } = monta("ok", false);
  const { el, classes } = elemento({ "data-link": IDS.whatsapp, "data-tipo": "whatsapp" });
  ouvintes.click({ target: el });
  assert.equal(status.textContent, "Abrindo o WhatsApp…");
  assert.ok(classes.has("lk-toque"));
});

test("body sem data-pagina: o toque segue igual e não manda beacon", () => {
  const { status, ouvintes, beacons } = monta("ok", true, null);
  const { el, classes } = elemento({ "data-link": IDS.whatsapp, "data-tipo": "whatsapp" });
  ouvintes.click({ target: el });
  assert.equal(status.textContent, "Abrindo o WhatsApp…");
  assert.ok(classes.has("lk-toque"));
  assert.deepEqual(beacons, []);
});

test("o <script> da página tem o beacon e nenhum texto ou id do lojista: é o mesmo JS pra qualquer loja", () => {
  assert.match(JS, /navigator\.sendBeacon\("\/api\/p\/bio\/toque",/);
  for (const d of [dadosFalsos(), dadosCheios()]) {
    const html = renderPaginaBio(d, { modo: "publica", nonce: null, animarEntrada: false });
    assert.equal(html.match(/<script>([\s\S]*?)<\/script>/)?.[1], JS);
    for (const texto of [d.paginaId, d.documento.perfil.nome, ...d.documento.links.flatMap((l) => [l.id, l.titulo])]) {
      assert.ok(!JS.includes(texto), texto);
    }
  }
});

// ---------------------------------------------------------------- PR 7: Pixel da Meta e GA4

const PIXEL = "1234567890";
const GA4 = "G-TESTE12345";
type Chamadas = ArrayLike<unknown>[];

/**
 * Roda o JS com rastreio num DOM falso que também tem o que o Pixel e o GA4 usam
 * (createElement, head, o primeiro <script>) e o que o beacon do 4b lê (body, sendBeacon).
 * `window` vai por parâmetro: no navegador é o global.
 */
function rodaComRastreio(rastreio: { metaPixelId: string; ga4Id: string }) {
  const js = scriptDaPagina({ rastreio });
  const janela: { fbq?: { queue: Chamadas }; dataLayer?: Chamadas } = {};
  const carregados: string[] = [];
  const ouvintes: Record<string, Ouvinte> = {};
  const anexa = (t: { src: string }) => carregados.push(t.src);
  const documento = {
    head: { appendChild: anexa },
    body: { getAttribute: (n: string) => (n === "data-pagina" ? "pagina-falsa" : null) },
    getElementById: () => ({ textContent: "" }),
    getElementsByTagName: () => [{ parentNode: { insertBefore: anexa } }],
    createElement: () => ({ async: false, src: "" }),
    addEventListener: (tipo: string, fn: Ouvinte) => {
      ouvintes[tipo] = fn;
    },
  };
  new Function("window", "document", "navigator", "addEventListener", "setTimeout", "clearTimeout", js)(
    janela,
    documento,
    { sendBeacon: () => true },
    () => undefined,
    () => 0,
    () => undefined,
  );
  return {
    js,
    carregados,
    ouvintes,
    /** O que o Pixel guardou na fila (o fbevents.js não carrega no teste). */
    fbq: () => (janela.fbq?.queue ?? []).map((a) => Array.from(a)),
    /** O que foi pro dataLayer do GA4. */
    ga: () => (janela.dataLayer ?? []).map((a) => Array.from(a)),
    toca: (tipo: string) => ouvintes.click({ target: elemento({ "data-link": "l1", "data-tipo": tipo }).el }),
  };
}

test("sem rastreio (null, ids vazios ou fora da regra) o JS é o mesmo, sem nada da Meta nem do Google", () => {
  assert.doesNotMatch(JS, /fbq|gtag|dataLayer|facebook|googletagmanager|BioToque|bio_toque/);
  for (const rastreio of [
    { metaPixelId: "", ga4Id: "" },
    { metaPixelId: "1234", ga4Id: "G-ABC" },
    { metaPixelId: "123456789012345678901", ga4Id: "g-teste12345" },
    { metaPixelId: '1234567";alert(1);//', ga4Id: 'G-ABCD"</script><script>alert(1)' },
    { metaPixelId: "１２３４５６", ga4Id: "G-TESTE 12345" },
  ]) {
    assert.equal(scriptDaPagina({ rastreio }), JS, JSON.stringify(rastreio));
  }
});

test("Pixel: autoConfig desligado imediatamente antes do init (o SDK não lê texto nem href do botão)", () => {
  const js = scriptDaPagina({ rastreio: { metaPixelId: PIXEL, ga4Id: "" } });
  assert.match(js, /"autoConfig",false/);
  assert.ok(js.indexOf('"autoConfig",false') < js.indexOf('window.fbq("init"'));
});

test("id que não é texto (array, número) não entra, mesmo que vire uma string válida", () => {
  const rastreio = { metaPixelId: ["1234567890"], ga4Id: ["G-TESTE12345"] } as unknown as { metaPixelId: string; ga4Id: string };
  assert.equal(scriptDaPagina({ rastreio }), JS);
  const numero = { metaPixelId: 1234567890, ga4Id: "" } as unknown as { metaPixelId: string; ga4Id: string };
  assert.equal(scriptDaPagina({ rastreio: numero }), JS);
});

test("GA4 com mais de 30 caracteres no total não entra no JS; com 30 entra", () => {
  assert.equal(scriptDaPagina({ rastreio: { metaPixelId: "", ga4Id: "G-" + "A".repeat(29) } }), JS);
  assert.match(scriptDaPagina({ rastreio: { metaPixelId: "", ga4Id: "G-" + "A".repeat(28) } }), /gtag\/js/);
});

test("Pixel: carrega o fbevents.js, init com o id e PageView ao abrir; nada do Google", () => {
  const r = rodaComRastreio({ metaPixelId: PIXEL, ga4Id: "" });
  assert.deepEqual(r.carregados, ["https://connect.facebook.net/en_US/fbevents.js"]);
  assert.deepEqual(r.fbq(), [["set", "autoConfig", false, PIXEL], ["init", PIXEL], ["track", "PageView"]]);
  assert.doesNotMatch(r.js, /googletagmanager|dataLayer|bio_toque/);
});

test("Pixel no toque: Contact no WhatsApp, BioToque com o tipo nos outros; nunca Lead", () => {
  const r = rodaComRastreio({ metaPixelId: PIXEL, ga4Id: "" });
  for (const tipo of ["whatsapp", "grupo", "link", "endereco"]) r.toca(tipo);
  assert.deepEqual(r.fbq().slice(3), [
    ["track", "Contact"],
    ["trackCustom", "BioToque", { botao: "grupo" }],
    ["trackCustom", "BioToque", { botao: "link" }],
    ["trackCustom", "BioToque", { botao: "endereco" }],
  ]);
  assert.doesNotMatch(r.js, /Lead/);
});

test("GA4: carrega o gtag.js com o id, config (o page_view sai sozinho) e bio_toque com o tipo em todo toque", () => {
  const r = rodaComRastreio({ metaPixelId: "", ga4Id: GA4 });
  assert.deepEqual(r.carregados, [`https://www.googletagmanager.com/gtag/js?id=${GA4}`]);
  const [js, config] = r.ga();
  assert.equal(js[0], "js");
  assert.ok(js[1] instanceof Date);
  assert.deepEqual(config, ["config", GA4]);
  r.toca("whatsapp");
  r.toca("grupo");
  assert.deepEqual(r.ga().slice(2), [
    ["event", "bio_toque", { botao: "whatsapp" }],
    ["event", "bio_toque", { botao: "grupo" }],
  ]);
  assert.doesNotMatch(r.js, /connect\.facebook\.net|fbq/);
});

test("Como chegar: o evento sai quando o <details> abre, não quando fecha (a regra do beacon do 4b)", () => {
  const r = rodaComRastreio({ metaPixelId: PIXEL, ga4Id: GA4 });
  // No clique o `open` ainda é o de antes: aberto = este toque fecha.
  const detalhes = { open: false };
  const { el } = elemento({ "data-link": "l-endereco", "data-tipo": "endereco" }, { tagName: "SUMMARY", parentNode: detalhes });
  r.ouvintes.click({ target: el }); // abre
  detalhes.open = true;
  r.ouvintes.click({ target: el }); // fecha
  assert.deepEqual(r.fbq().slice(3), [["trackCustom", "BioToque", { botao: "endereco" }]]);
  assert.deepEqual(r.ga().slice(2), [["event", "bio_toque", { botao: "endereco" }]]);
});

test("os dois juntos: ES5, sem '<', em 3 KB; Copiar CNPJ e clique fora de botão não disparam evento", () => {
  const r = rodaComRastreio({ metaPixelId: "12345678901234567890", ga4Id: GA4 });
  const bytes = Buffer.byteLength(r.js);
  assert.ok(bytes <= 3 * 1024, `${bytes} bytes`);
  assert.doesNotMatch(r.js, /<|=>|`|\b(?:let|const|class)\b/);
  assert.equal(r.carregados.length, 2);
  const antes = [r.fbq().length, r.ga().length];
  r.ouvintes.click({ target: elemento({ "data-copiar": "11222333000181" }).el });
  r.ouvintes.click({ target: { closest: () => null } });
  r.ouvintes.click({ target: elemento({ "data-link": "l1" }).el });
  assert.deepEqual([r.fbq().length, r.ga().length], antes);
});

test("um id inválido não leva o outro junto", () => {
  const soPixel = rodaComRastreio({ metaPixelId: PIXEL, ga4Id: "G-ab12" });
  assert.deepEqual(soPixel.carregados, ["https://connect.facebook.net/en_US/fbevents.js"]);
  const soGa = rodaComRastreio({ metaPixelId: "12a45", ga4Id: GA4 });
  assert.deepEqual(soGa.carregados, [`https://www.googletagmanager.com/gtag/js?id=${GA4}`]);
});

test("o Pixel quebrado não derruba o GA4 nem o resto da página", () => {
  const js = scriptDaPagina({ rastreio: { metaPixelId: PIXEL, ga4Id: GA4 } });
  const janela: { dataLayer?: Chamadas } = {};
  const ouvintes: Record<string, Ouvinte> = {};
  const documento = {
    head: { appendChild: () => undefined },
    body: { getAttribute: () => "pagina-falsa" },
    getElementById: () => ({ textContent: "" }),
    getElementsByTagName: () => [], // sem <script>: o snippet do Pixel quebra no insertBefore
    createElement: () => ({}),
    addEventListener: (tipo: string, fn: Ouvinte) => {
      ouvintes[tipo] = fn;
    },
  };
  new Function("window", "document", "navigator", "addEventListener", "setTimeout", "clearTimeout", js)(
    janela,
    documento,
    { sendBeacon: () => true },
    (tipo: string, fn: Ouvinte) => {
      ouvintes[`janela:${tipo}`] = fn;
    },
    () => 0,
    () => undefined,
  );
  assert.equal(typeof ouvintes.click, "function");
  assert.equal(typeof ouvintes["janela:pageshow"], "function");
  ouvintes.click({ target: elemento({ "data-link": "l1", "data-tipo": "grupo" }).el });
  assert.deepEqual((janela.dataLayer ?? []).map((a) => Array.from(a)).slice(2), [["event", "bio_toque", { botao: "grupo" }]]);
});
