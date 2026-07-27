import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { isAdminGroup, jidDigits } from "./admin-group";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

/** O grupo real capturado na F1, onde o número conectado é superadmin. */
function upsertGroupFixture() {
  const raw = JSON.parse(readFileSync(join(FIXTURES, "groups-upsert.json"), "utf8"));
  return raw.data[0];
}

const MY_PHONE = "5511999990001";

test("jidDigits strips domain and device suffix", () => {
  assert.equal(jidDigits("5511999990001@s.whatsapp.net"), "5511999990001");
  assert.equal(jidDigits("5511999990001:12@s.whatsapp.net"), "5511999990001");
  assert.equal(jidDigits("20100000000000001@lid"), "20100000000000001");
  assert.equal(jidDigits(null), "");
});

test("recognises admin on the real captured group", () => {
  assert.equal(isAdminGroup(upsertGroupFixture(), MY_PHONE), true);
});

test("a group where we only participate is not admin", () => {
  assert.equal(
    isAdminGroup(
      {
        owner: "22100000000000009@lid",
        participants: [
          { id: "22100000000000009@lid", phoneNumber: "5511999990009@s.whatsapp.net", admin: "superadmin" },
          { id: "20100000000000001@lid", phoneNumber: `${MY_PHONE}@s.whatsapp.net`, admin: null },
        ],
      },
      MY_PHONE,
    ),
    false,
  );
});

test("matches by phoneNumber even when the id is a @lid", () => {
  // É o caso real: a Evolution manda o participante como @lid e o telefone ao
  // lado. Casar só por `id` perderia todo grupo admin.
  assert.equal(
    isAdminGroup(
      {
        participants: [
          { id: "22100000000000003@lid", phoneNumber: `${MY_PHONE}@s.whatsapp.net`, admin: "admin" },
        ],
      },
      MY_PHONE,
    ),
    true,
  );
});

test("the owner is admin by definition", () => {
  assert.equal(isAdminGroup({ ownerPn: `${MY_PHONE}@s.whatsapp.net` }, MY_PHONE), true);
});

test("without a known phone nothing is admin", () => {
  // Instância sem telefone ainda: na dúvida, não monitora.
  assert.equal(isAdminGroup(upsertGroupFixture(), null), false);
  assert.equal(isAdminGroup(upsertGroupFixture(), ""), false);
});

test("a group with no participants is not admin", () => {
  assert.equal(isAdminGroup({}, MY_PHONE), false);
  assert.equal(isAdminGroup({ participants: [] }, MY_PHONE), false);
});

test("a non-admin role never counts", () => {
  assert.equal(
    isAdminGroup(
      { participants: [{ phoneNumber: `${MY_PHONE}@s.whatsapp.net`, admin: "member" }] },
      MY_PHONE,
    ),
    false,
  );
});
