import assert from "node:assert/strict";
import test from "node:test";

import {
  bulkDidWork,
  runBulkTick,
  type BulkAck,
  type BulkDeps,
  type BulkJobClaim,
} from "./bulk-loop.js";

type AckCall = { jobId: string; ack: BulkAck };

type Recorded = {
  acks: AckCall[];
  opened: string[];
  closed: string[];
  described: Array<{ jid: string; text: string }>;
  pictured: Array<{ jid: string; url: string }>;
};

function job(over: Partial<BulkJobClaim> = {}): BulkJobClaim {
  return { id: "job-1", action: "open", whatsappGroupId: "111@g.us", ...over };
}

function makeDeps(over: Partial<BulkDeps> = {}): { deps: BulkDeps; rec: Recorded } {
  const rec: Recorded = { acks: [], opened: [], closed: [], described: [], pictured: [] };
  const deps: BulkDeps = {
    listTenants: async () => ["tenant-a"],
    claimJobs: async () => [job()],
    ack: async (_tenantId, jobId, ack) => {
      rec.acks.push({ jobId, ack });
    },
    instanceFor: async () => "girumo-1",
    setOpenToAll: async (_i, jid) => {
      rec.opened.push(jid);
    },
    setAnnounceOnly: async (_i, jid) => {
      rec.closed.push(jid);
    },
    setDescription: async (_i, jid, text) => {
      rec.described.push({ jid, text });
    },
    setPicture: async (_i, jid, url) => {
      rec.pictured.push({ jid, url });
    },
    signedMediaUrl: async () => "https://signed.local/foto.jpg",
    ...over,
  };
  return { deps, rec };
}

test("open chama setOpenToAll e conclui", async () => {
  const { deps, rec } = makeDeps();

  const summary = await runBulkTick(deps);

  assert.deepEqual(rec.opened, ["111@g.us"]);
  assert.deepEqual(rec.acks, [{ jobId: "job-1", ack: { status: "done" } }]);
  assert.equal(summary.done, 1);
  assert.equal(summary.failed, 0);
});

test("close chama setAnnounceOnly", async () => {
  const { deps, rec } = makeDeps({ claimJobs: async () => [job({ action: "close" })] });

  await runBulkTick(deps);

  assert.deepEqual(rec.closed, ["111@g.us"]);
  assert.equal(rec.opened.length, 0);
});

test("set_description aplica o texto exato, inclusive vazio", async () => {
  // Descricao vazia APAGA a descricao no WhatsApp. E acao valida, e o loop nao
  // pode transformar "" em outra coisa no caminho.
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ action: "set_description", description: "" })],
  });

  await runBulkTick(deps);

  assert.deepEqual(rec.described, [{ jid: "111@g.us", text: "" }]);
});

test("set_picture assina a midia antes de aplicar", async () => {
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ action: "set_picture", mediaId: "m1" })],
  });

  await runBulkTick(deps);

  assert.deepEqual(rec.pictured, [{ jid: "111@g.us", url: "https://signed.local/foto.jpg" }]);
});

test("midia que nao assina falha o job SEM chamar a Evolution", async () => {
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ action: "set_picture", mediaId: "sumida" })],
    signedMediaUrl: async () => null,
  });

  const summary = await runBulkTick(deps);

  assert.equal(rec.pictured.length, 0, "nao pode chamar updateGroupPicture sem URL");
  assert.equal(summary.failed, 1);
  assert.equal(rec.acks[0]?.ack.status, "failed");
  assert.match(String(rec.acks[0]?.ack.error), /imagem/i);
});

test("tenant sem instancia falha o job e nao chama a Evolution", async () => {
  const { deps, rec } = makeDeps({ instanceFor: async () => null });

  const summary = await runBulkTick(deps);

  assert.equal(rec.opened.length, 0);
  assert.equal(summary.failed, 1);
  assert.match(String(rec.acks[0]?.ack.error), /instância/i);
});

test("erro da Evolution vira ack failed com a mensagem", async () => {
  const { deps, rec } = makeDeps({
    setOpenToAll: async () => {
      throw new Error("Evolution group/updateSetting falhou (403)");
    },
  });

  const summary = await runBulkTick(deps);

  assert.equal(summary.failed, 1);
  assert.match(String(rec.acks[0]?.ack.error), /403/);
});

test("teto de ritmo: so a primeira operacao roda; o excedente falha explicito", async () => {
  // Este e o teste que segura o anti-ban. Se ele parar de valer, um p_limit
  // alterado sem querer viraria rajada silenciosa contra o WhatsApp.
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ id: "j1" }), job({ id: "j2" }), job({ id: "j3" })],
  });

  const summary = await runBulkTick(deps);

  assert.deepEqual(rec.opened, ["111@g.us"], "so UMA operacao real por tenant por tick");
  assert.equal(summary.done, 1);
  assert.equal(summary.failed, 2);
  assert.match(String(rec.acks[1]?.ack.error), /ritmo/i);
});

test("falha de um tenant nao impede o proximo", async () => {
  const { deps, rec } = makeDeps({
    listTenants: async () => ["a", "b"],
    claimJobs: async (tenantId) => {
      if (tenantId === "a") throw new Error("app fora do ar");
      return [job()];
    },
  });

  const summary = await runBulkTick(deps);

  assert.equal(summary.done, 1);
  assert.equal(rec.opened.length, 1);
});

test("tenant sem job na fila nao gasta chamada nenhuma", async () => {
  const { deps, rec } = makeDeps({ claimJobs: async () => [] });

  const summary = await runBulkTick(deps);

  assert.equal(rec.acks.length, 0);
  assert.equal(summary.claimed, 0);
  assert.equal(bulkDidWork(summary), false);
});

test("bulkDidWork so e verdadeiro quando algo aconteceu", () => {
  assert.equal(bulkDidWork({ tenants: 3, claimed: 0, done: 0, failed: 0 }), false);
  assert.equal(bulkDidWork({ tenants: 1, claimed: 1, done: 1, failed: 0 }), true);
  assert.equal(bulkDidWork({ tenants: 1, claimed: 1, done: 0, failed: 1 }), true);
});
