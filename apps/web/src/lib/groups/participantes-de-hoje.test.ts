import assert from "node:assert/strict";
import test from "node:test";

import { JANELA_DA_ULTIMA_LEITURA_MS, naUltimaLeitura } from "./participantes-de-hoje";

const AGORA = Date.parse("2026-11-12T12:00:00.000Z");
const em = (msAntes: number) => new Date(AGORA - msAntes).toISOString();

test("ignora a linha de quem saiu: lida antes da janela da última leitura do grupo", () => {
  const linhas = [
    { whatsappGroupId: "a", participantLid: "fica", lastSeenAt: em(0) },
    { whatsappGroupId: "a", participantLid: "saiu", lastSeenAt: em(11 * 24 * 60 * 60 * 1000) },
  ];
  assert.deepEqual(
    naUltimaLeitura(linhas).map((l) => l.participantLid),
    ["fica"],
  );
});

test("dentro da janela conta, um ms fora não conta", () => {
  const linhas = [
    { whatsappGroupId: "a", participantLid: "ultima", lastSeenAt: em(0) },
    { whatsappGroupId: "a", participantLid: "no-limite", lastSeenAt: em(JANELA_DA_ULTIMA_LEITURA_MS) },
    { whatsappGroupId: "a", participantLid: "fora", lastSeenAt: em(JANELA_DA_ULTIMA_LEITURA_MS + 1) },
  ];
  assert.deepEqual(
    naUltimaLeitura(linhas).map((l) => l.participantLid),
    ["ultima", "no-limite"],
  );
});

test("a janela é de cada grupo: grupo lido há dias mantém a lista da última leitura dele", () => {
  const dias = 5 * 24 * 60 * 60 * 1000;
  const linhas = [
    { whatsappGroupId: "novo", participantLid: "p1", lastSeenAt: em(0) },
    { whatsappGroupId: "velho", participantLid: "p2", lastSeenAt: em(dias) },
    { whatsappGroupId: "velho", participantLid: "p3", lastSeenAt: em(dias) },
  ];
  assert.equal(naUltimaLeitura(linhas).length, 3);
});

test("linha sem data válida fica fora sem derrubar as outras", () => {
  const linhas = [
    { whatsappGroupId: "a", participantLid: "ok", lastSeenAt: em(0) },
    { whatsappGroupId: "a", participantLid: "lixo", lastSeenAt: "não é data" },
  ];
  assert.deepEqual(
    naUltimaLeitura(linhas).map((l) => l.participantLid),
    ["ok"],
  );
});
