import assert from "node:assert/strict";
import { test } from "node:test";

import { IDS, dadosCheios, dadosFalsos } from "@/test/bio-dados-falsos";
import { renderPaginaBio } from "./index";
import { scriptDaPagina } from "./script";

const JS = scriptDaPagina({ rastreio: null });

type Ouvinte = (e: unknown) => void;

/** Roda o script com um DOM falso: só o que ele usa (status, clique, pageshow, área de transferência, beacon). */
function monta(clipboard: "ok" | "falha" | "sem" = "ok", comBeacon = true) {
  const status = { textContent: "" };
  const ouvintes: Record<string, Ouvinte> = {};
  const copiados: string[] = [];
  const beacons: [string, string][] = [];
  const timers: (() => void)[] = [];
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
    body: { getAttribute: (n: string) => (n === "data-pagina" ? IDS.pagina : null) },
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
    (fn: () => void) => timers.push(fn),
    () => undefined,
  );
  /** Roda os setTimeout pendentes (o relógio do teste). */
  const passa = () => timers.splice(0).forEach((fn) => fn());
  return { status, ouvintes, copiados, beacons, passa };
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
  assert.equal(negado.status.textContent, "");

  const sem = monta("sem");
  const terceiro = elemento({ "data-copiar": "11222333000181" });
  sem.ouvintes.click({ target: terceiro.el });
  await tique();
  assert.equal(terceiro.el.textContent, "Copiar CNPJ");
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
