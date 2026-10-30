import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertAvisoNosso,
  assertNomeDeTeste,
  caminhoNoObjeto,
  celulares,
  contarEntregues,
  nomeDaInstancia,
  prepararBruto,
  temMarcador,
  urlDoTunel,
  veredictoAssinatura,
} from "./comum.mjs";

const SEGREDO = "segredo-de-teste-da-fase-0";
const assinar = (dados, formato = "base64") => createHmac("sha256", SEGREDO).update(dados).digest(formato);

test("prova 4 do Rastreio: conta enviados e entregues só na janela de 45 a 15 dias atrás", () => {
  const agora = Date.UTC(2026, 9, 30, 12); // janela: 2026-09-15 a 2026-10-15, as duas pontas dentro
  const pedidos = [
    { created_at: { date: "2026-09-20 10:00:00.000000", timezone: "America/Sao_Paulo" }, delivered: true, track_code: "AA123456789BR" },
    { created_at: "2026-10-01 08:00:00", status: { data: { alias: "on_carriage" } } },
    { created_at: { date: "2026-10-05 09:00:00.000000" }, statuses: { data: [{ alias: "paid" }, { status: { data: { alias: "delivered" } } }] } },
    { created_at: { date: "2026-10-15 23:59:00.000000" }, status: { data: { alias: "paid" } } },
    { created_at: { date: "2026-10-16 00:01:00.000000" }, delivered: true },
    { created_at: { date: "2026-09-14 09:00:00.000000" }, delivered: true },
    { status: { data: { alias: "delivered" } } },
  ];
  assert.deepEqual(contarEntregues(pedidos, agora), {
    baixados: 7,
    semData: 1,
    naJanela: 4,
    enviados: 3,
    entregues: 2,
    maisAntigo: "2026-09-14",
    maisNovo: "2026-10-16",
  });
  // sem aliases de "enviado", só o código de rastreio e o "entregue" contam
  assert.equal(contarEntregues(pedidos, agora, []).enviados, 2);
});

test("assinatura da Yampi: base64 do HMAC do corpo cru", () => {
  const corpo = Buffer.from('{"event":"order.paid","nome":"João/ç"}');
  assert.equal(veredictoAssinatura(corpo, assinar(corpo), SEGREDO), "ok");
  assert.equal(veredictoAssinatura(corpo, assinar(corpo), "outro-segredo"), "invalido");
  assert.equal(veredictoAssinatura(corpo, undefined, SEGREDO), "sem_cabecalho");
  assert.equal(veredictoAssinatura(corpo, assinar(corpo), null), "sem_segredo");
});

test("assinatura: diagnostica as variantes que a doc não deixa claras", () => {
  const corpo = Buffer.from('{ "event": "order.paid" }');
  assert.equal(veredictoAssinatura(corpo, assinar(corpo, "hex"), SEGREDO), "so_hex");
  const reserializado = JSON.stringify(JSON.parse(corpo.toString()));
  assert.equal(veredictoAssinatura(corpo, assinar(reserializado), SEGREDO), "so_json_reserializado");
});

test("marcador: e-mail sem diferença de caixa e telefone em qualquer formatação", () => {
  assert.equal(temMarcador('{"email":"Dono@Real.com"}', ["dono@real.com"]), true);
  assert.equal(temMarcador('{"formated_number":"(21) 98765-4321"}', ["987654321"]), true);
  assert.equal(temMarcador('{"email":"outra@pessoa.com","phone":"11988887777"}', ["dono@real.com", "987654321"]), false);
});

test("trava: a chave global só mexe em instância de teste", () => {
  assert.equal(assertNomeDeTeste("fase0-recuperar-20261029"), "fase0-recuperar-20261029");
  assert.throws(() => assertNomeDeTeste("gr_3f1a2b4c-0000-0000-0000-000000000000"), /não é instância de teste/);
  assert.throws(() => assertNomeDeTeste("fase0-recuperar-"), /não é instância de teste/);
  assert.throws(() => nomeDaInstancia({ FASE0_INSTANCIA: "producao" }), /não é instância de teste/);
  assert.match(nomeDaInstancia({}), /^fase0-recuperar-\d{8}$/);
});

test("trava: só apaga o aviso que a Fase 0 criou", () => {
  assert.doesNotThrow(() => assertAvisoNosso({ id: 7, name: "girumo-fase0-recuperar" }, "7"));
  assert.throws(() => assertAvisoNosso({ id: 7, name: "bling-pedidos" }, 7), /não é o que a Fase 0 criou/);
  assert.throws(() => assertAvisoNosso({ id: 8, name: "girumo-fase0-recuperar" }, 7), /não é o que a Fase 0 criou/);
  assert.throws(() => assertAvisoNosso(null, 7), /não é o que a Fase 0 criou/);
});

test("pasta do bruto: cria as subpastas e recusa repositório git", () => {
  const fora = mkdtempSync(join(tmpdir(), "fase0-"));
  assert.ok(prepararBruto(join(fora, "bruto")).endsWith("bruto"));
  mkdirSync(join(fora, ".git"));
  assert.throws(() => prepararBruto(join(fora, "bruto2")), /dentro de um repositório git/);
});

test("auxiliares: caminho no objeto, URL do túnel e celulares", () => {
  assert.equal(caminhoNoObjeto({ a: { b: [{ c: 1 }] } }, "a.b[0].c"), 1);
  assert.equal(caminhoNoObjeto({ a: null }, "a.b.c"), undefined);
  assert.equal(urlDoTunel("|  https://exemplo-teste-um.trycloudflare.com  |"), "https://exemplo-teste-um.trycloudflare.com");
  assert.equal(urlDoTunel("sem url aqui"), null);
  assert.deepEqual(celulares({ FASE0_CELULARES: "chip=5511999990001, B=5511999990002,ruim=123" }), { CHIP: "5511999990001", B: "5511999990002" });
});
