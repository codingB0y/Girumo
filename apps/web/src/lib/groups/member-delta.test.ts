import assert from "node:assert/strict";
import { memberCountDelta } from "./member-delta";

const p = (id: string) => ({ id, phoneNumber: id.split("@")[0], admin: null });

// Entrada e saída movem o tamanho do grupo.
assert.equal(memberCountDelta("add", [p("5511999990001@s.whatsapp.net")]), 1);
assert.equal(memberCountDelta("add", [p("5511999990001@lid"), p("5511999990002@lid")]), 2);
assert.equal(memberCountDelta("remove", [p("5511999990001@lid")]), -1);

// Mudança de papel NAO e entrada nem saida: quem contasse promote como +1
// inflaria a contagem toda vez que um admin fosse nomeado.
assert.equal(memberCountDelta("promote", [p("5511999990001@lid")]), 0);
assert.equal(memberCountDelta("demote", [p("5511999990001@lid")]), 0);
assert.equal(memberCountDelta("qualquer-outra", [p("5511999990001@lid")]), 0);

// O mesmo participante repetido no lote conta uma vez so.
assert.equal(
  memberCountDelta("add", [p("5511999990001@lid"), p("5511999990001@s.whatsapp.net")]),
  1,
);

// Lista vazia ou ausente nao move nada — nem para cima nem para baixo.
assert.equal(memberCountDelta("add", []), 0);
assert.equal(memberCountDelta("add", null), 0);
assert.equal(memberCountDelta("remove", undefined), 0);

// Participante sem identificador nenhum e descartado: contar um fantasma
// deixaria a contagem errada para sempre, sem ninguem a quem atribui-la.
assert.equal(memberCountDelta("add", [{ id: null, phoneNumber: null, admin: null }]), 0);

console.log("member-delta: ok");
