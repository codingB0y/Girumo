import assert from "node:assert/strict";
import test from "node:test";

import {
  runGrow,
  runGrowTick,
  type GrowAck,
  type GrowDeps,
  type GrowInstance,
  type GrowJobClaim,
} from "./grow-loop.js";

const INSTANCE: GrowInstance = { name: "girumo-1", ownerPhone: "556298191314" };

type AckCall = { tenantId: string; jobId: string; ack: GrowAck };

type Recorded = {
  acks: AckCall[];
  created: Array<{ instanceName: string; subject: string }>;
  descriptions: string[];
  announces: string[];
  pictures: string[];
  invites: string[];
  ownerPhones: string[];
};

function job(over: Partial<GrowJobClaim> = {}): GrowJobClaim {
  return {
    id: "job-1",
    campaignSlug: "bazar",
    subject: "Bazar #2",
    announce: true,
    memberAddMode: "admin_add",
    ...over,
  };
}

/** Deps de mentira com caminho feliz por default; cada teste sobrescreve o que precisa. */
function makeDeps(over: Partial<GrowDeps> = {}): { deps: GrowDeps; rec: Recorded } {
  const rec: Recorded = { acks: [], created: [], descriptions: [], announces: [], pictures: [], invites: [], ownerPhones: [] };
  const deps: GrowDeps = {
    listTenants: async () => ["tenant-a"],
    claimJobs: async () => [job()],
    ack: async (tenantId, jobId, ack) => {
      rec.acks.push({ tenantId, jobId, ack });
    },
    instanceFor: async () => ({ name: "girumo-1", ownerPhone: "556298191314" }),
    createGroup: async (instanceName, subject, ownerPhone) => {
      rec.ownerPhones.push(ownerPhone);
      rec.created.push({ instanceName, subject });
      return "120363000000000001@g.us";
    },
    setDescription: async (_i, _j, description) => {
      rec.descriptions.push(description);
    },
    setAnnounceOnly: async (_i, groupJid) => {
      rec.announces.push(groupJid);
    },
    setPicture: async (_i, _j, imageUrl) => {
      rec.pictures.push(imageUrl);
    },
    inviteUrl: async (_i, groupJid) => {
      rec.invites.push(groupJid);
      return "https://chat.whatsapp.com/ABC123";
    },
    signedMediaUrl: async () => "https://signed.example/foto.jpg",
    ...over,
  };
  return { deps, rec };
}

const lastAck = (rec: Recorded): GrowAck => {
  const call = rec.acks.at(-1);
  assert.ok(call, "esperava ao menos um ack");
  return call.ack;
};

test("cria o grupo e reporta o convite ao app", async () => {
  const { deps, rec } = makeDeps();

  const ok = await runGrow("tenant-a", INSTANCE, job(), deps);

  assert.equal(ok, true);
  assert.deepEqual(rec.created, [{ instanceName: "girumo-1", subject: "Bazar #2" }]);
  assert.deepEqual(lastAck(rec), {
    status: "created",
    whatsappGroupId: "120363000000000001@g.us",
    members: 1,
    inviteLink: "https://chat.whatsapp.com/ABC123",
  });
});

test("renova o lease com um ack running ANTES de criar o grupo", async () => {
  // Sem isso, uma criação lenta seria dada como presa pelo failStaleRunning.
  const order: string[] = [];
  const { deps } = makeDeps({
    ack: async (_t, _j, ack) => {
      order.push(`ack:${ack.status}`);
    },
    createGroup: async () => {
      order.push("create");
      return "120363000000000002@g.us";
    },
  });

  await runGrow("tenant-a", INSTANCE, job(), deps);

  assert.deepEqual(order.slice(0, 2), ["ack:running", "create"]);
});

test("sem link de convite o job falha, mas o ack carrega o JID do grupo criado", async () => {
  // O grupo existe no WhatsApp mesmo sem link; perder o JID deixaria um grupo órfão.
  const { deps, rec } = makeDeps({ inviteUrl: async () => null });

  const ok = await runGrow("tenant-a", INSTANCE, job(), deps);

  assert.equal(ok, false);
  const ack = lastAck(rec);
  assert.equal(ack.status, "failed");
  assert.equal(ack.whatsappGroupId, "120363000000000001@g.us");
  assert.match(ack.error ?? "", /inviteLink/);
});

test("falha ao criar o grupo fecha o job sem tentar pegar convite", async () => {
  const { deps, rec } = makeDeps({
    createGroup: async () => {
      throw new Error("rate-overlimit");
    },
  });

  const ok = await runGrow("tenant-a", INSTANCE, job(), deps);

  assert.equal(ok, false);
  assert.deepEqual(rec.invites, []);
  assert.match(lastAck(rec).error ?? "", /createGroup: rate-overlimit/);
});

test("falha num passo cosmético não invalida o grupo", async () => {
  // Refazer custaria outra criação da janela anti-ban; o que importa é o link.
  const { deps, rec } = makeDeps({
    setDescription: async () => {
      throw new Error("403");
    },
    setPicture: async () => {
      throw new Error("timeout");
    },
  });

  const ok = await runGrow("tenant-a", INSTANCE, job({ desc: "Bazar diário", mediaId: "m1" }), deps);

  assert.equal(ok, true);
  assert.equal(lastAck(rec).status, "created");
});

test("announce false não aplica o modo só-admin", async () => {
  const { deps, rec } = makeDeps();

  await runGrow("tenant-a", INSTANCE, job({ announce: false }), deps);

  assert.deepEqual(rec.announces, []);
});

test("mídia apagada não impede o grupo: pula a foto e segue", async () => {
  const { deps, rec } = makeDeps({ signedMediaUrl: async () => null });

  const ok = await runGrow("tenant-a", INSTANCE, job({ mediaId: "m1" }), deps);

  assert.equal(ok, true);
  assert.deepEqual(rec.pictures, []);
});

test("teto anti-ban: só UMA criação por tenant por ciclo", async () => {
  // O bucket in-memory do GroupOperationGuard virou cadência; sem este teto o
  // worker criaria os 3 grupos de uma vez e queimaria o número.
  const { deps, rec } = makeDeps({ claimJobs: async () => [job({ id: "a" }), job({ id: "b" }), job({ id: "c" })] });

  const summary = await runGrowTick(deps);

  assert.equal(rec.created.length, 1);
  assert.equal(summary.claimed, 3);
  assert.equal(summary.created, 1);
  assert.equal(summary.deferred, 2);
});

test("job adiado pelo ritmo volta para a fila em vez de ficar preso em running", async () => {
  const { deps, rec } = makeDeps({ claimJobs: async () => [job({ id: "a" }), job({ id: "b" })] });

  await runGrowTick(deps);

  const adiado = rec.acks.find((call) => call.jobId === "b");
  assert.ok(adiado, "o job excedente precisa receber ack");
  assert.equal(adiado.ack.status, "failed");
  assert.match(adiado.ack.error ?? "", /ritmo anti-ban/);
});

test("tenant sem instância utilizável devolve os jobs sem criar nada", async () => {
  const { deps, rec } = makeDeps({
    instanceFor: async () => null,
    claimJobs: async () => [job({ id: "a" }), job({ id: "b" })],
  });

  const summary = await runGrowTick(deps);

  assert.deepEqual(rec.created, []);
  assert.equal(summary.deferred, 2);
  assert.equal(rec.acks.length, 2);
  assert.match(rec.acks[0]?.ack.error ?? "", /sem instância utilizável/);
});

test("claim que falha num tenant não impede os demais", async () => {
  const { deps, rec } = makeDeps({
    listTenants: async () => ["tenant-a", "tenant-b"],
    claimJobs: async (tenantId) => {
      if (tenantId === "tenant-a") throw new Error("app fora do ar");
      return [job({ id: "b1" })];
    },
  });

  const summary = await runGrowTick(deps);

  assert.equal(summary.created, 1);
  assert.deepEqual(rec.created, [{ instanceName: "girumo-1", subject: "Bazar #2" }]);
});

test("nenhum tenant com auto-grow: ciclo é um no-op", async () => {
  const { deps, rec } = makeDeps({ listTenants: async () => [] });

  const summary = await runGrowTick(deps);

  assert.deepEqual(summary, { tenants: 0, claimed: 0, created: 0, failed: 0, deferred: 0 });
  assert.deepEqual(rec.acks, []);
});
