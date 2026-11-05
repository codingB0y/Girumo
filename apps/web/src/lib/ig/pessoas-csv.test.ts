import assert from "node:assert/strict";
import { test } from "node:test";
import type { PessoaDto } from "./pessoas-tipos";
import { csvDePessoas } from "./pessoas-csv";

const pessoa = (extra: Partial<PessoaDto>): PessoaDto => ({
  id: "p1", username: "ana", fields: {}, tags: [], firstSeenAt: "2026-11-01T00:00:00Z", lastSeenAt: "2026-11-02T00:00:00Z", lastDmAt: null, sourceFlowId: null, sourceFlowName: null, ...extra,
});

test("CSV: BOM, CRLF, cabeçalho com os campos da loja em ordem e tudo entre aspas", () => {
  const csv = csvDePessoas([pessoa({ fields: { tamanho: "P", cor: "azul" }, tags: ["vip", "atacado"], sourceFlowName: "Comentou" })]);
  assert.ok(csv.startsWith("﻿"));
  const [cab, linha] = csv.slice(1).split("\r\n");
  assert.equal(cab, '"usuario","etiquetas","cor","tamanho","primeira_conversa","ultima_conversa","ultima_mensagem","veio_por"');
  assert.equal(linha, '"ana","vip;atacado","azul","P","2026-11-01T00:00:00Z","2026-11-02T00:00:00Z","","Comentou"');
});

test("CSV: aspas viram aspas dobradas e quebra de linha fica dentro da célula", () => {
  const csv = csvDePessoas([pessoa({ fields: { nota: 'disse "oi"\nde novo, ok' } })]);
  assert.ok(csv.includes('"disse ""oi""\nde novo, ok"'));
});

test("CSV: célula que começa com = + - @ vira texto (sem fórmula)", () => {
  for (const perigoso of ["=1+1", "+cmd", "-2", "@soma", "\tx", " =1"]) {
    const csv = csvDePessoas([pessoa({ fields: { nota: perigoso } })]);
    assert.ok(csv.includes(`"'${perigoso.replace(/"/g, '""')}"`), perigoso);
  }
  assert.ok(csvDePessoas([pessoa({ username: "-ana" })]).includes(`"'-ana"`));
});

test("CSV: lista vazia só tem o cabeçalho", () => {
  assert.equal(csvDePessoas([]).slice(1).split("\r\n")[0], '"usuario","etiquetas","primeira_conversa","ultima_conversa","ultima_mensagem","veio_por"');
});
