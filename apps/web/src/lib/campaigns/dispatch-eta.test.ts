import { test } from "node:test";
import assert from "node:assert/strict";
import { etaDisparo } from "./dispatch-eta";

test("ETA usa 6 s por mensagem restante e arredonda para cima", () => {
  assert.equal(etaDisparo({ sent: 38, total: 91 }), "≈ 6 min");
  assert.equal(etaDisparo({ sent: 0, total: 5 }), "≈ 1 min");
  assert.equal(etaDisparo({ sent: 91, total: 91 }), null);
});
