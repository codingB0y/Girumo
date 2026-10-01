import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gruposNovosDoUpsert, type UpsertGroup } from "./upsert-novos";

const AGORA = "2026-10-01T12:00:00.000Z";
const MEU = "5511999990001";

// === payload real capturado da Evolution: nós criamos o grupo, somos superadmin ===
{
  const fixture = JSON.parse(
    readFileSync(new URL("../evolution/__fixtures__/groups-upsert.json", import.meta.url), "utf8"),
  ) as { data: UpsertGroup[] };
  const rows = gruposNovosDoUpsert(fixture.data, MEU, [MEU], AGORA);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    whatsapp_group_id: "12036120363099999999999@g.us",
    name: "Teste Girumo",
    members: 1,
    is_admin: true,
    admins_total: 1,
    admins_ours: 1,
    admins_counted_at: AGORA,
    community_jid: null,
    community_role: null,
  });
}

// === grupo em que somos só participante não entra ===
{
  const rows = gruposNovosDoUpsert(
    [
      {
        id: "x@g.us",
        subject: "Grupo da tia",
        participants: [
          { id: "1@lid", phoneNumber: `${MEU}@s.whatsapp.net`, admin: null },
          { id: "2@lid", phoneNumber: "5511888880000@s.whatsapp.net", admin: "superadmin" },
        ],
      },
    ],
    MEU,
    [MEU],
    AGORA,
  );
  assert.deepEqual(rows, []);
}

// === sem telefone da instância: na dúvida, não grava ===
{
  const rows = gruposNovosDoUpsert(
    [{ id: "y@g.us", participants: [{ id: "1@lid", phoneNumber: MEU, admin: "admin" }] }],
    null,
    [],
    AGORA,
  );
  assert.deepEqual(rows, []);
}

// === subgrupo de comunidade carrega o vínculo; nome vazio vira fallback ===
{
  const [row] = gruposNovosDoUpsert(
    [
      {
        id: "z@g.us",
        subject: "   ",
        size: 40,
        linkedParent: "pai@g.us",
        participants: [{ id: "1@lid", phoneNumber: MEU, admin: "admin" }],
      },
    ],
    MEU,
    [MEU],
    AGORA,
  );
  assert.equal(row.name, "Grupo sem nome");
  assert.equal(row.members, 40);
  assert.equal(row.community_jid, "pai@g.us");
  assert.equal(row.community_role, "member");
}
