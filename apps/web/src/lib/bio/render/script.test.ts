import assert from "node:assert/strict";
import { test } from "node:test";

import { scriptDaPagina } from "./script";

const JS = scriptDaPagina({ rastreio: null });

type Ouvinte = (e: unknown) => void;

/** Roda o script com um DOM falso: só o que ele usa (status, clique, pageshow, área de transferência). */
function monta(clipboard: "ok" | "falha" | "sem" = "ok") {
  const status = { textContent: "" };
  const ouvintes: Record<string, Ouvinte> = {};
  const copiados: string[] = [];
  const timers: (() => void)[] = [];
  const navegador =
    clipboard === "sem"
      ? {}
      : {
          clipboard: {
            writeText: (t: string) => {
              copiados.push(t);
              return clipboard === "ok" ? Promise.resolve() : Promise.reject(new Error("negado"));
            },
          },
        };
  const documento = {
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
  return { status, ouvintes, copiados, passa };
}

function elemento(attrs: Record<string, string>) {
  const classes = new Set<string>();
  const el = {
    textContent: "Copiar CNPJ",
    offsetWidth: 0,
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
    closest: (): unknown => el,
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
