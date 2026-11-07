import assert from "node:assert/strict";
import { test } from "node:test";

import { leadsNovosDoSync, type GrupoDoSync } from "./leads-do-sync";

const G = "120363000000000001@g.us";

function grupo(participantes: GrupoDoSync["participantes"]): GrupoDoSync {
  return { whatsappGroupId: G, nome: "VIP 1", participantes };
}

const novo = { participantLid: "111@lid", phone: "5562999990001@s.whatsapp.net", isAdmin: false };
const antigo = { participantLid: "222@lid", phone: "5562999990002@s.whatsapp.net", isAdmin: false };

test("quem aparece pela primeira vez num grupo já visto vira lead", () => {
  const leads = leadsNovosDoSync([grupo([novo, antigo])], new Map([[G, new Set(["222@lid"])]]), new Set());
  assert.deepEqual(leads, [{ phone: novo.phone, whatsappGroupId: G, nomeDoGrupo: "VIP 1" }]);
});

test("primeira leitura do grupo não transforma a base antiga em lead", () => {
  assert.deepEqual(leadsNovosDoSync([grupo([novo, antigo])], new Map(), new Set()), []);
  assert.deepEqual(leadsNovosDoSync([grupo([novo])], new Map([[G, new Set()]]), new Set()), []);
});

test("admin, participante sem telefone e opt-out ficam de fora", () => {
  const vistos = new Map([[G, new Set(["222@lid"])]]);
  const admin = { ...novo, participantLid: "333@lid", isAdmin: true };
  const semTelefone = { participantLid: "444@lid", phone: null, isAdmin: false };
  // opt-out gravado sem o 55 e sem o nono dígito: a chave tem que casar mesmo assim
  const optouts = new Set(["6299990001"]);
  assert.deepEqual(leadsNovosDoSync([grupo([admin, semTelefone, novo])], vistos, optouts), []);
});
