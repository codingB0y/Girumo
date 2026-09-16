import { strict as assert } from "node:assert";
import { test } from "node:test";
import { gruposOrfaos } from "./orfaos";

test("grupo fora de toda colecao e orfao", () => {
  const grupos = [{ whatsappGroupId: "1@g.us" }, { whatsappGroupId: "2@g.us" }];
  const colecoes = [{ groupIds: ["1@g.us"] }];
  assert.deepEqual(gruposOrfaos(grupos, colecoes).map((g) => g.whatsappGroupId), ["2@g.us"]);
});

test("grupo em duas colecoes nao e orfao e nao duplica", () => {
  const grupos = [{ whatsappGroupId: "1@g.us" }];
  const colecoes = [{ groupIds: ["1@g.us"] }, { groupIds: ["1@g.us"] }];
  assert.deepEqual(gruposOrfaos(grupos, colecoes), []);
});

test("sem colecao nenhuma, todo grupo e orfao", () => {
  const grupos = [{ whatsappGroupId: "1@g.us" }];
  assert.equal(gruposOrfaos(grupos, []).length, 1);
});

test("groupIds nulo nao quebra", () => {
  const grupos = [{ whatsappGroupId: "1@g.us" }];
  const colecoes = [{ groupIds: null }];
  assert.equal(gruposOrfaos(grupos, colecoes).length, 1);
});
