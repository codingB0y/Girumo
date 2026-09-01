import assert from "node:assert/strict";
import { test } from "node:test";

import { lidMapFromParticipants, mergeLidMaps } from "./lid-map";

test("mapeia lid para telefone e ignora quem não tem", () => {
  const mapa = lidMapFromParticipants({
    participants: [
      { id: "111@lid", phoneNumber: "5511999998888" },
      { id: "222@lid", phoneNumber: null },
      { id: "333@lid" },
      { id: "5511977776666@s.whatsapp.net" },
    ],
  });

  assert.equal(mapa["111@lid"], "5511999998888");
  // Sem telefone não vira entrada: null aqui viraria "telefone desconhecido"
  // indistinguível de "nunca vimos essa pessoa".
  assert.equal("222@lid" in mapa, false);
  assert.equal("333@lid" in mapa, false);
  // Quem já veio com o número não precisa de mapa, mas mapear não custa.
  assert.equal(mapa["5511977776666@s.whatsapp.net"], "5511977776666");
});

test("mapa vazio quando não há participantes", () => {
  assert.deepEqual(lidMapFromParticipants({}), {});
  assert.deepEqual(lidMapFromParticipants({ participants: [] }), {});
});

test("mergeLidMaps: o primeiro argumento ganha", () => {
  // A fonte ao vivo (fetchAllGroups) vence o histórico: quem trocou de número
  // tem o valor novo no participante atual, e o antigo no evento de meses atrás.
  const vivo = { "111@lid": "5511111111111" };
  const historico = { "111@lid": "5522222222222", "999@lid": "5533333333333" };

  assert.deepEqual(mergeLidMaps(vivo, historico), {
    "111@lid": "5511111111111",
    "999@lid": "5533333333333",
  });
});

test("mergeLidMaps ignora telefone malformado", () => {
  assert.deepEqual(mergeLidMaps({ "1@lid": "abc" }, { "2@lid": "" }), {});
});
