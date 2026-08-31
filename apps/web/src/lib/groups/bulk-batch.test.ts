import assert from "node:assert/strict";
import test from "node:test";

import { buildBulkJobs, type BulkTargetGroup } from "./bulk-batch";

const BASE = { tenantId: "t1", campaignGroupId: "c1", batchId: "b1" };
const GRUPOS: BulkTargetGroup[] = [
  { id: "g1", whatsapp_group_id: "111@g.us" },
  { id: "g2", whatsapp_group_id: "222@g.us" },
];

test("gera um job por grupo", () => {
  const jobs = buildBulkJobs({ ...BASE, action: "open", groups: GRUPOS });

  assert.equal(jobs.length, 2);
  assert.deepEqual(
    jobs.map((j) => j.group_id),
    ["g1", "g2"],
  );
  assert.deepEqual(
    jobs.map((j) => j.whatsapp_group_id),
    ["111@g.us", "222@g.us"],
  );
});

test("todo job do lote carrega o mesmo batch_id — e o que da o progresso", () => {
  const jobs = buildBulkJobs({ ...BASE, action: "close", groups: GRUPOS });

  assert.deepEqual(new Set(jobs.map((j) => j.batch_id)), new Set(["b1"]));
});

test("open e close nao carregam descricao nem midia", () => {
  const [job] = buildBulkJobs({ ...BASE, action: "close", groups: [GRUPOS[0]] });

  assert.equal(job.description, null);
  assert.equal(job.media_id, null);
  assert.equal(job.action, "close");
});

test("set_description carrega o texto e zera a midia", () => {
  const [job] = buildBulkJobs({
    ...BASE,
    action: "set_description",
    groups: [GRUPOS[0]],
    description: "Bazar VIP",
  });

  assert.equal(job.description, "Bazar VIP");
  assert.equal(job.media_id, null);
});

test("set_description aceita string vazia — apagar a descricao e uma acao valida", () => {
  const [job] = buildBulkJobs({
    ...BASE,
    action: "set_description",
    groups: [GRUPOS[0]],
    description: "",
  });

  assert.equal(job.description, "");
});

test("set_description sem description e erro, nao string vazia silenciosa", () => {
  // String vazia APAGA a descricao dos grupos no WhatsApp. E acao legitima, mas
  // tem de ser pedida — nunca o default de um campo esquecido.
  assert.throws(
    () => buildBulkJobs({ ...BASE, action: "set_description", groups: GRUPOS }),
    /descrição/i,
  );
});

test("set_picture carrega a midia e zera a descricao", () => {
  const [job] = buildBulkJobs({
    ...BASE,
    action: "set_picture",
    groups: [GRUPOS[0]],
    mediaId: "m1",
  });

  assert.equal(job.media_id, "m1");
  assert.equal(job.description, null);
});

test("set_picture sem mediaId e erro", () => {
  assert.throws(() => buildBulkJobs({ ...BASE, action: "set_picture", groups: GRUPOS }), /imagem/i);
});

test("carga de outra acao e ignorada — open com description nao vira job com texto", () => {
  const [job] = buildBulkJobs({
    ...BASE,
    action: "open",
    groups: [GRUPOS[0]],
    description: "sobra de um formulario anterior",
    mediaId: "m1",
  });

  assert.equal(job.description, null);
  assert.equal(job.media_id, null);
});

test("grupo sem whatsapp_group_id e descartado — nao da para agir nele", () => {
  // Enfileirar um job sem JID so produziria uma falha garantida alguns minutos
  // depois, gastando uma janela do ritmo anti-ban a toa.
  const jobs = buildBulkJobs({
    ...BASE,
    action: "open",
    groups: [GRUPOS[0], { id: "g3", whatsapp_group_id: null }],
  });

  assert.deepEqual(
    jobs.map((j) => j.group_id),
    ["g1"],
  );
});

test("lista vazia devolve lote vazio, sem erro", () => {
  assert.deepEqual(buildBulkJobs({ ...BASE, action: "open", groups: [] }), []);
});

test("tenant e campanha vao em todo job — o filtro multi-tenant nasce aqui", () => {
  const jobs = buildBulkJobs({ ...BASE, action: "open", groups: GRUPOS });

  for (const job of jobs) {
    assert.equal(job.tenant_id, "t1");
    assert.equal(job.campaign_group_id, "c1");
  }
});
