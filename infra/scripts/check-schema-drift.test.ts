import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  carregarAllowlist,
  diffAssinaturas,
  formatarRelatorio,
  idadeEmDias,
  type Assinatura,
  type EntradaAllowlist,
} from "./check-schema-drift";

const PROD: Assinatura = {
  "t|plans": "aaa",
  "t|instances": "bbb",
  "f|move_card(text, text, text, text)": "ccc",
};

function allowlist(...objetos: string[]): EntradaAllowlist[] {
  return objetos.map((objeto) => ({
    objeto,
    motivo: "fixture",
    desde: "2026-08-22",
    prazo: "2026-09-30",
  }));
}

test("bancos identicos nao produzem divergencia", () => {
  const r = diffAssinaturas(PROD, { ...PROD }, []);
  assert.deepEqual(r.bloqueantes, []);
  assert.deepEqual(r.toleradas, []);
});

// O teste que da sentido ao gate. Sem ele, um `return { bloqueantes: [] }`
// constante passaria em tudo que existe acima.
test("objeto que falta em dev REPROVA", () => {
  const dev = { ...PROD };
  delete dev["t|instances"];

  const r = diffAssinaturas(PROD, dev, []);
  assert.equal(r.bloqueantes.length, 1);
  assert.equal(r.bloqueantes[0].objeto, "t|instances");
  assert.equal(r.bloqueantes[0].tipo, "faltando_em_dev");
});

// Este e o sentido do B.1 — o que quebrou producao em 22/08/2026. Dev tinha
// `plans.price_cents`, prod nao, e a tela mostrou MRR R$ 0,00 sem erro nenhum.
test("objeto que existe so em dev REPROVA (o sentido do B.1)", () => {
  const dev: Assinatura = { ...PROD, "t|tabela_so_de_dev": "zzz" };

  const r = diffAssinaturas(PROD, dev, []);
  assert.equal(r.bloqueantes.length, 1);
  assert.equal(r.bloqueantes[0].objeto, "t|tabela_so_de_dev");
  assert.equal(r.bloqueantes[0].tipo, "faltando_em_prod");
});

test("mesmo objeto com forma diferente REPROVA", () => {
  const dev: Assinatura = { ...PROD, "t|plans": "outro-md5" };

  const r = diffAssinaturas(PROD, dev, []);
  assert.equal(r.bloqueantes.length, 1);
  assert.equal(r.bloqueantes[0].tipo, "forma_diferente");
  // O detalhe precisa mostrar os dois lados, senao o relatorio nao diz nada
  // acionavel para quem le o log do CI.
  assert.match(r.bloqueantes[0].detalhe, /prod aaa != dev outro-md/);
});

test("divergencia na allowlist e tolerada, nao bloqueante", () => {
  const dev = { ...PROD };
  delete dev["t|instances"];

  const r = diffAssinaturas(PROD, dev, allowlist("t|instances"));
  assert.deepEqual(r.bloqueantes, []);
  assert.equal(r.toleradas.length, 1);
  assert.equal(r.toleradas[0].objeto, "t|instances");
});

// A allowlist so serve enquanto significa alguma coisa. Entrada que sobrou
// depois do objeto ter sido aplicado precisa aparecer, senao vira cemiterio.
test("entrada de allowlist sem divergencia correspondente e sinalizada como ociosa", () => {
  const r = diffAssinaturas(PROD, { ...PROD }, allowlist("t|ja_foi_resolvida"));
  assert.deepEqual(r.bloqueantes, []);
  assert.deepEqual(r.allowlistOciosa, ["t|ja_foi_resolvida"]);
});

test("allowlist nao mascara divergencia de outro objeto", () => {
  const dev = { ...PROD };
  delete dev["t|instances"];
  delete dev["t|plans"];

  const r = diffAssinaturas(PROD, dev, allowlist("t|instances"));
  assert.equal(r.bloqueantes.length, 1);
  assert.equal(r.bloqueantes[0].objeto, "t|plans");
});

test("varias divergencias sao reportadas juntas, em ordem estavel", () => {
  const dev: Assinatura = { "f|move_card(text, text, text, text)": "ccc", "t|so_dev": "x" };

  const r = diffAssinaturas(PROD, dev, []);
  assert.deepEqual(
    r.bloqueantes.map((d) => d.objeto),
    ["t|instances", "t|plans", "t|so_dev"],
  );
});

test("relatorio nomeia cada objeto bloqueante", () => {
  const dev = { ...PROD };
  delete dev["t|plans"];

  const texto = formatarRelatorio(diffAssinaturas(PROD, dev, []));
  assert.match(texto, /DRIFT: 1 divergencia/);
  assert.match(texto, /t\|plans/);
});

test("idadeEmDias conta dias inteiros e recusa data invalida", () => {
  const agora = new Date("2026-08-22T12:00:00Z");
  assert.equal(idadeEmDias("2026-08-22T00:00:00Z", agora), 0);
  assert.equal(idadeEmDias("2026-07-23T12:00:00Z", agora), 30);
  assert.throws(() => idadeEmDias("nao-e-data", agora));
});

test("allowlist ausente e lista vazia, nao erro", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hubflow-drift-"));
  try {
    assert.deepEqual(await carregarAllowlist(path.join(dir, "nao-existe.json")), []);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("allowlist e lida do arquivo com motivo e prazo", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hubflow-drift-"));
  const caminho = path.join(dir, "allowlist.json");
  try {
    await fs.writeFile(
      caminho,
      JSON.stringify({
        entradas: [{ objeto: "t|squads", motivo: "Squad OS", desde: "2026-08-22", prazo: "2026-09-30" }],
      }),
      "utf8",
    );
    const entradas = await carregarAllowlist(caminho);
    assert.equal(entradas.length, 1);
    assert.equal(entradas[0].objeto, "t|squads");
    assert.equal(entradas[0].prazo, "2026-09-30");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
