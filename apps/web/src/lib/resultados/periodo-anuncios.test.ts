import assert from "node:assert/strict";
import { test } from "node:test";

import { dataValida, diasEntre, periodoDaBusca, periodoDoAtalho, somarDias } from "./periodo-anuncios";

/** 10/10/2026 às 02:00 UTC = 09/10 às 23:00 em Brasília: o "hoje" é 09/10. */
const VIRADA = new Date("2026-10-10T02:00:00Z");
const MEIO_DIA = new Date("2026-10-10T15:00:00Z");

test("atalhos contam hoje e usam o dia de Brasília, não o UTC", () => {
  assert.deepEqual(periodoDoAtalho("30d", MEIO_DIA), { de: "2026-09-11", ate: "2026-10-10" });
  assert.deepEqual(periodoDoAtalho("7d", MEIO_DIA), { de: "2026-10-04", ate: "2026-10-10" });
  assert.deepEqual(periodoDoAtalho("90d", MEIO_DIA), { de: "2026-07-13", ate: "2026-10-10" });
  assert.deepEqual(periodoDoAtalho("mes", MEIO_DIA), { de: "2026-10-01", ate: "2026-10-10" });
  assert.deepEqual(periodoDoAtalho("30d", VIRADA), { de: "2026-09-10", ate: "2026-10-09" });
  assert.deepEqual(periodoDoAtalho("mes", new Date("2026-11-01T02:00:00Z")), { de: "2026-10-01", ate: "2026-10-31" });
});

test("contas de data pura atravessam mês e ano", () => {
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(diasEntre("2026-09-11", "2026-10-10"), 29);
  assert.equal(diasEntre("2026-10-10", "2026-10-09"), -1);
});

test("data que não existe ou fora do formato é recusada", () => {
  assert.equal(dataValida("2026-10-10"), true);
  assert.equal(dataValida("2026-02-30"), false);
  assert.equal(dataValida("2026-13-01"), false);
  assert.equal(dataValida("10/10/2026"), false);
  assert.equal(dataValida("2026-10-10T00:00:00Z"), false);
  assert.equal(dataValida(""), false);
});

test("busca sem datas vale os últimos 30 dias", () => {
  assert.deepEqual(periodoDaBusca(new URLSearchParams(""), MEIO_DIA), {
    ok: true,
    periodo: { de: "2026-09-11", ate: "2026-10-10" },
  });
});

test("busca válida passa; o limite de 400 dias é o do SQL (ate - de)", () => {
  assert.deepEqual(periodoDaBusca(new URLSearchParams("de=2026-10-10&ate=2026-10-10"), MEIO_DIA), {
    ok: true,
    periodo: { de: "2026-10-10", ate: "2026-10-10" },
  });
  const limite = periodoDaBusca(new URLSearchParams(`de=2025-09-05&ate=${somarDias("2025-09-05", 400)}`), MEIO_DIA);
  assert.equal(limite.ok, true);
  const passou = periodoDaBusca(new URLSearchParams(`de=2025-09-05&ate=${somarDias("2025-09-05", 401)}`), MEIO_DIA);
  assert.deepEqual(passou, { ok: false, erro: "Escolha um período de até 400 dias." });
});

test("busca com uma data só, data inválida ou invertida: erro com mensagem", () => {
  const erro = (q: string) => {
    const lido = periodoDaBusca(new URLSearchParams(q), MEIO_DIA);
    return lido.ok ? null : lido.erro;
  };
  assert.equal(erro("de=2026-10-01"), "Informe as duas datas: de e ate.");
  assert.equal(erro("ate=2026-10-01"), "Informe as duas datas: de e ate.");
  assert.equal(erro("de=2026-02-30&ate=2026-03-10"), "Data inválida: use AAAA-MM-DD.");
  assert.equal(erro("de=&ate="), "Data inválida: use AAAA-MM-DD.");
  assert.equal(erro("de=2026-10-10&ate=2026-09-01"), "A data inicial vem depois da final.");
});
