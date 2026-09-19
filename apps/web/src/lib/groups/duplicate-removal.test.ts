import assert from "node:assert/strict";
import test from "node:test";

import {
  findDuplicates,
  planRemovePhoneEverywhere,
  toRemoveParticipantJobs,
  type ParticipantRow,
} from "./duplicate-removal";
import type { BulkTargetGroup } from "./bulk-batch";

const GROUP_IDS = ["a@g.us", "b@g.us", "c@g.us"];

function row(over: Partial<ParticipantRow>): ParticipantRow {
  return { whatsappGroupId: "a@g.us", participantLid: "lid-1", phone: null, ...over };
}

/* ---------- findDuplicates ---------- */

test("pessoa em dois grupos e reportada; mantem no PRIMEIRO da ordem de groupIds", () => {
  const rows: ParticipantRow[] = [
    row({ whatsappGroupId: "b@g.us", participantLid: "lid-1", phone: "5511999990001" }),
    row({ whatsappGroupId: "a@g.us", participantLid: "lid-1", phone: "5511999990001" }),
  ];

  const dup = findDuplicates(GROUP_IDS, rows);

  assert.equal(dup.length, 1);
  assert.equal(dup[0].keepGroupId, "a@g.us", "a@g.us vem antes de b@g.us em GROUP_IDS");
  assert.deepEqual(dup[0].removeFromGroupIds, ["b@g.us"]);
  assert.equal(dup[0].phone, "5511999990001");
});

test("pessoa em um grupo so nao e duplicado", () => {
  const rows: ParticipantRow[] = [row({ whatsappGroupId: "a@g.us", participantLid: "lid-1" })];
  assert.deepEqual(findDuplicates(GROUP_IDS, rows), []);
});

test("sem telefone conhecido ainda e reportado — nunca inventa numero", () => {
  const rows: ParticipantRow[] = [
    row({ whatsappGroupId: "a@g.us", participantLid: "lid-1", phone: null }),
    row({ whatsappGroupId: "b@g.us", participantLid: "lid-1", phone: null }),
  ];
  const dup = findDuplicates(GROUP_IDS, rows);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].phone, null);
});

test("grupo fora do escopo da campanha nao conta pra duplicidade", () => {
  const rows: ParticipantRow[] = [
    row({ whatsappGroupId: "a@g.us", participantLid: "lid-1", phone: "5511999990001" }),
    row({ whatsappGroupId: "FORA@g.us", participantLid: "lid-1", phone: "5511999990001" }),
  ];
  assert.deepEqual(findDuplicates(GROUP_IDS, rows), []);
});

test("telefone gravado com formatacao e normalizado (digitos)", () => {
  const rows: ParticipantRow[] = [
    row({ whatsappGroupId: "a@g.us", participantLid: "lid-1", phone: "+55 11 99999-0001" }),
    row({ whatsappGroupId: "b@g.us", participantLid: "lid-1", phone: "+55 11 99999-0001" }),
  ];
  const dup = findDuplicates(GROUP_IDS, rows);
  assert.equal(dup[0].phone, "5511999990001");
});

test("tres grupos: mantem o primeiro, remove os outros dois", () => {
  const rows: ParticipantRow[] = [
    row({ whatsappGroupId: "c@g.us", participantLid: "lid-1", phone: "1" }),
    row({ whatsappGroupId: "a@g.us", participantLid: "lid-1", phone: "1" }),
    row({ whatsappGroupId: "b@g.us", participantLid: "lid-1", phone: "1" }),
  ];
  const dup = findDuplicates(GROUP_IDS, rows);
  assert.equal(dup[0].keepGroupId, "a@g.us");
  assert.deepEqual(dup[0].removeFromGroupIds, ["b@g.us", "c@g.us"]);
});

/* ---------- planRemovePhoneEverywhere ---------- */

test("acha todos os grupos administrados onde o telefone aparece", () => {
  const rows: ParticipantRow[] = [
    row({ whatsappGroupId: "a@g.us", participantLid: "lid-1", phone: "5511999990001" }),
    row({ whatsappGroupId: "c@g.us", participantLid: "lid-2", phone: "5511999990001" }),
    row({ whatsappGroupId: "b@g.us", participantLid: "lid-3", phone: "OUTRO" }),
  ];
  assert.deepEqual(
    planRemovePhoneEverywhere("5511999990001", GROUP_IDS, rows),
    ["a@g.us", "c@g.us"],
  );
});

test("telefone com formatacao diferente ainda casa", () => {
  const rows: ParticipantRow[] = [
    row({ whatsappGroupId: "a@g.us", phone: "5511999990001" }),
  ];
  assert.deepEqual(planRemovePhoneEverywhere("+55 (11) 99999-0001", GROUP_IDS, rows), ["a@g.us"]);
});

test("telefone nao encontrado devolve lista vazia", () => {
  const rows: ParticipantRow[] = [row({ whatsappGroupId: "a@g.us", phone: "111" })];
  assert.deepEqual(planRemovePhoneEverywhere("999", GROUP_IDS, rows), []);
});

test("telefone vazio ou so-simbolos nao casa nada", () => {
  const rows: ParticipantRow[] = [row({ whatsappGroupId: "a@g.us", phone: "111" })];
  assert.deepEqual(planRemovePhoneEverywhere("", GROUP_IDS, rows), []);
});

/* ---------- toRemoveParticipantJobs ---------- */

const TARGETS = new Map<string, BulkTargetGroup>([
  ["a@g.us", { id: "uuid-a", whatsapp_group_id: "a@g.us" }],
  ["b@g.us", { id: "uuid-b", whatsapp_group_id: "b@g.us" }],
]);
const COMMON = { tenantId: "t1", campaignGroupId: "cg1", batchId: "batch-1" };

test("um job por grupo-alvo, todos com o mesmo telefone", () => {
  const jobs = toRemoveParticipantJobs(
    [{ phone: "5511999990001", groupIds: ["a@g.us", "b@g.us"] }],
    TARGETS,
    COMMON,
  );
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((j) => j.target_phone === "5511999990001"));
  assert.deepEqual(jobs.map((j) => j.group_id).sort(), ["uuid-a", "uuid-b"]);
});

test("telefones diferentes viram jobs independentes no mesmo batch", () => {
  const jobs = toRemoveParticipantJobs(
    [
      { phone: "111", groupIds: ["a@g.us"] },
      { phone: "222", groupIds: ["b@g.us"] },
    ],
    TARGETS,
    COMMON,
  );
  assert.deepEqual(
    jobs.map((j) => [j.target_phone, j.group_id]),
    [
      ["111", "uuid-a"],
      ["222", "uuid-b"],
    ],
  );
  assert.equal(new Set(jobs.map((j) => j.batch_id)).size, 1);
});

test("grupo sem alvo correspondente (nao-admin ou desconhecido) e descartado", () => {
  const jobs = toRemoveParticipantJobs(
    [{ phone: "111", groupIds: ["FORA-DO-TARGETS@g.us"] }],
    TARGETS,
    COMMON,
  );
  assert.deepEqual(jobs, []);
});
