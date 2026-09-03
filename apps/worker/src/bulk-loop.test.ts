import assert from "node:assert/strict";
import test from "node:test";

import {
  bulkDidWork,
  drainInFlight,
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
  invitesLidos: string[];
};

/**
 * ATENÇÃO ao editar `makeDeps`: o tsconfig do worker tem
 * `exclude: ["src/**\/*.test.ts"]`, então `tsc` NÃO confere este arquivo, e o
 * `tsx` apaga os tipos em vez de checá-los. Uma dep que falte aqui não vira erro
 * de compilação — vira `deps.X is not a function` no meio de um teste, ou pior,
 * um ramo que nunca é exercido. Ao acrescentar método em `BulkDeps`, acrescente
 * aqui na mão.
 */

function job(over: Partial<BulkJobClaim> = {}): BulkJobClaim {
  return { id: "job-1", action: "open", whatsappGroupId: "111@g.us", ...over };
}

function makeDeps(over: Partial<BulkDeps> = {}): { deps: BulkDeps; rec: Recorded } {
  const rec: Recorded = {
    acks: [],
    opened: [],
    closed: [],
    described: [],
    pictured: [],
    invitesLidos: [],
  };
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
    inviteUrl: async (_i, jid) => {
      rec.invitesLidos.push(jid);
      return "https://chat.whatsapp.com/ABCdef123456";
    },
    ...over,
  };
  return { deps, rec };
}

/** Erro da Evolution, com o `status` que o ack precisa repassar. */
class ErroEvolution extends Error {
  readonly status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

test("open chama setOpenToAll e conclui", async () => {
  const { deps, rec } = makeDeps();

  const summary = await runBulkTick(deps);
  await drainInFlight();

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
  await drainInFlight();

  assert.deepEqual(rec.pictured, [{ jid: "111@g.us", url: "https://signed.local/foto.jpg" }]);
});

test("midia que nao assina falha o job SEM chamar a Evolution", async () => {
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ action: "set_picture", mediaId: "sumida" })],
    signedMediaUrl: async () => null,
  });

  const summary = await runBulkTick(deps);
  await drainInFlight();

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
  await drainInFlight();

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
  await drainInFlight();

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
  await drainInFlight();

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

test("check_invite le o convite e devolve no ack", async () => {
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ id: "rev-1", action: "check_invite" })],
  });

  const summary = await runBulkTick(deps);
  await drainInFlight();

  assert.deepEqual(rec.invitesLidos, ["111@g.us"]);
  assert.deepEqual(rec.acks, [
    { jobId: "rev-1", ack: { status: "done", invite: "https://chat.whatsapp.com/ABCdef123456" } },
  ]);
  assert.equal(summary.done, 1);
});

test("Evolution sem convite: ack manda invite null, nao falha", async () => {
  // `null` e resposta, nao erro. Falhar aqui esconderia do lojista o grupo que
  // esta justamente sem link para divulgar.
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ id: "rev-2", action: "check_invite" })],
    inviteUrl: async () => null,
  });

  const summary = await runBulkTick(deps);
  await drainInFlight();

  assert.deepEqual(rec.acks, [{ jobId: "rev-2", ack: { status: "done", invite: null } }]);
  assert.equal(summary.done, 1);
  assert.equal(summary.failed, 0);
});

test("falha carrega o status HTTP — e o que separa passageiro de permanente", async () => {
  // Sem o status, o servidor nao consegue distinguir "perdi o admin" (403,
  // permanente) de "a Evolution caiu" (503, passageiro), e marcaria 91 grupos
  // bons como quebrados numa queda de rede.
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ id: "rev-3", action: "check_invite" })],
    inviteUrl: async () => {
      throw new ErroEvolution(403, "Evolution group/inviteCode falhou (403): not-authorized");
    },
  });

  await runBulkTick(deps);
  await drainInFlight();

  assert.equal(rec.acks.length, 1);
  const ack = rec.acks[0]!.ack;
  assert.equal(ack.status, "failed");
  assert.equal(ack.httpStatus, 403);
  assert.ok(ack.detail?.includes("not-authorized"), "detail deve levar a causa da Evolution");
});

test("o tick devolve antes da Evolution terminar e o ack chega depois", async () => {
  let resolveEvolution!: () => void;
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ id: "j1", action: "open" })],
    setOpenToAll: () =>
      new Promise<void>((resolve) => {
        resolveEvolution = resolve;
      }),
  });

  const summary = await runBulkTick(deps);

  assert.equal(summary.started, 1);
  assert.deepEqual(rec.acks, [], "ack nao pode ter chegado antes da Evolution responder");

  resolveEvolution();
  await drainInFlight();

  assert.deepEqual(
    rec.acks.map((a) => a.jobId),
    ["j1"],
  );
});

test("tenants correm em paralelo: dois tenants, um tick, dois starts", async () => {
  const starts: string[] = [];
  const { deps } = makeDeps({
    listTenants: async () => ["t1", "t2"],
    claimJobs: async (tenantId) => [job({ id: `j-${tenantId}` })],
    setOpenToAll: async () => {
      starts.push("x");
    },
  });

  const summary = await runBulkTick(deps);
  await drainInFlight();

  assert.equal(summary.started, 2);
  assert.equal(starts.length, 2);
});

test("acao sem dado nao poe a chave invite no ack", async () => {
  // `open` e `close` nao produzem dado nenhum; um `invite: null` pendurado ali
  // faria o servidor tratar como revisao que nao achou convite.
  const { deps, rec } = makeDeps({
    claimJobs: async () => [job({ id: "abre", action: "open" })],
  });

  await runBulkTick(deps);
  await drainInFlight();

  assert.deepEqual(rec.acks, [{ jobId: "abre", ack: { status: "done" } }]);
});
