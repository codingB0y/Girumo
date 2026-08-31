import assert from "node:assert/strict";
import test from "node:test";

import { buildBulkJobs, selectBulkTargets, type BulkTargetGroup } from "./bulk-batch";

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

/* ---------- selectBulkTargets ---------- */

// `campaign_groups.group_ids` guarda whatsapp_group_id, nao o UUID de `groups`.
// Casar pela coluna errada devolveria lote vazio em producao com dado real.
test("casa group_ids por whatsapp_group_id e devolve o UUID do grupo", () => {
  const sel = selectBulkTargets(["120@g.us"], [
    { id: "uuid-1", whatsapp_group_id: "120@g.us", is_admin: true },
  ]);
  assert.deepEqual(sel.targets, [{ id: "uuid-1", whatsapp_group_id: "120@g.us" }]);
  assert.equal(sel.skippedNoAdmin, 0);
  assert.equal(sel.skippedNoId, 0);
});

// O caso que motivou a decisao: 105 grupos sem admin nunca sao elegiveis, e
// enfileira-los gastaria 4s de janela anti-ban cada um so para falhar.
test("grupo onde nao somos admin fica de fora e e contado", () => {
  const sel = selectBulkTargets(["a@g.us", "b@g.us"], [
    { id: "uuid-a", whatsapp_group_id: "a@g.us", is_admin: true },
    { id: "uuid-b", whatsapp_group_id: "b@g.us", is_admin: false },
  ]);
  assert.deepEqual(sel.targets.map((t) => t.id), ["uuid-a"]);
  assert.equal(sel.skippedNoAdmin, 1);
});

// `is_admin` e opcional na store. Ausente significa "nunca medimos", nao "sim":
// tratar como admin mandaria o lote para grupos que talvez recusem a operacao.
test("is_admin ausente ou nulo conta como nao-admin", () => {
  const sel = selectBulkTargets(["a@g.us", "b@g.us"], [
    { id: "uuid-a", whatsapp_group_id: "a@g.us" },
    { id: "uuid-b", whatsapp_group_id: "b@g.us", is_admin: null },
  ]);
  assert.deepEqual(sel.targets, []);
  assert.equal(sel.skippedNoAdmin, 2);
});

test("id da campanha sem grupo correspondente conta como sem id", () => {
  const sel = selectBulkTargets(["sumiu@g.us"], [
    { id: "uuid-a", whatsapp_group_id: "a@g.us", is_admin: true },
  ]);
  assert.deepEqual(sel.targets, []);
  assert.equal(sel.skippedNoId, 1);
});

test("grupo sem whatsapp_group_id nunca e alvo", () => {
  const sel = selectBulkTargets(["a@g.us"], [
    { id: "uuid-a", whatsapp_group_id: null, is_admin: true },
  ]);
  assert.deepEqual(sel.targets, []);
  assert.equal(sel.skippedNoId, 1);
});

// group_ids repetido geraria "aplicar em 3 grupos" com 2 grupos na tela — e o
// indice unico da tabela absorveria a duplicata em silencio no insert.
test("group_ids repetido nao duplica o alvo nem a contagem", () => {
  const sel = selectBulkTargets(["a@g.us", "a@g.us"], [
    { id: "uuid-a", whatsapp_group_id: "a@g.us", is_admin: true },
  ]);
  assert.equal(sel.targets.length, 1);
});
