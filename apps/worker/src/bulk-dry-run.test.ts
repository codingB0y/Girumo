import assert from "node:assert/strict";
import test from "node:test";

import { BULK_DRY_RUN_REASON, withBulkDryRun } from "./bulk-dry-run.js";
import { runBulkTick, type BulkAck, type BulkDeps, type BulkJobClaim } from "./bulk-loop.js";

function baseDeps(over: Partial<BulkDeps> = {}): BulkDeps {
  return {
    listTenants: async () => ["t1"],
    claimJobs: async () => [{ id: "j1", action: "open", whatsappGroupId: "111@g.us" }],
    ack: async () => {},
    instanceFor: async () => "girumo-1",
    setOpenToAll: async () => {},
    setAnnounceOnly: async () => {},
    setDescription: async () => {},
    setPicture: async () => {},
    signedMediaUrl: async () => "https://signed.local/f.jpg",
    ...over,
  };
}

test("dry-run nao chama NENHUMA das quatro operacoes reais", async () => {
  const chamou: string[] = [];
  const jobs: BulkJobClaim[] = [
    { id: "j1", action: "open", whatsappGroupId: "111@g.us" },
    { id: "j2", action: "close", whatsappGroupId: "222@g.us" },
    { id: "j3", action: "set_description", whatsappGroupId: "333@g.us", description: "x" },
    { id: "j4", action: "set_picture", whatsappGroupId: "444@g.us", mediaId: "m1" },
  ];

  const deps = withBulkDryRun(
    baseDeps({
      claimJobs: async () => jobs.splice(0, 1),
      setOpenToAll: async () => {
        chamou.push("open");
      },
      setAnnounceOnly: async () => {
        chamou.push("close");
      },
      setDescription: async () => {
        chamou.push("desc");
      },
      setPicture: async () => {
        chamou.push("foto");
      },
    }),
  );

  for (let i = 0; i < 4; i += 1) await runBulkTick(deps);

  assert.deepEqual(chamou, [], "nada pode tocar a Evolution em dry-run");
});

test("dry-run falha o job com motivo explicito, nao em silencio", async () => {
  // Sem ack, o job ficaria pendurado em `running` ate o failStaleRunning cinco
  // minutos depois — e quem olhasse o progresso veria um lote travado sem
  // explicacao nenhuma.
  const acks: BulkAck[] = [];
  const deps = withBulkDryRun(
    baseDeps({
      ack: async (_t, _j, ack) => {
        acks.push(ack);
      },
    }),
  );

  const summary = await runBulkTick(deps);

  assert.equal(summary.failed, 1);
  assert.equal(summary.done, 0);
  assert.equal(acks[0]?.status, "failed");
  assert.equal(acks[0]?.error, BULK_DRY_RUN_REASON);
  assert.match(BULK_DRY_RUN_REASON, /WORKER_BULK_ENABLED/);
});

test("dry-run deixa claim e instanceFor rodarem de verdade", async () => {
  // O valor do dry-run e exercitar o caminho INTEIRO ate a porta da Evolution.
  // Se ele curto-circuitasse antes do claim, nao provaria nada.
  let claimou = false;
  let resolveuInstancia = false;

  const deps = withBulkDryRun(
    baseDeps({
      claimJobs: async () => {
        claimou = true;
        return [{ id: "j1", action: "close", whatsappGroupId: "111@g.us" }];
      },
      instanceFor: async () => {
        resolveuInstancia = true;
        return "girumo-1";
      },
    }),
  );

  await runBulkTick(deps);

  assert.equal(claimou, true);
  assert.equal(resolveuInstancia, true);
});

test("dry-run de foto ainda assina a midia — a assinatura e parte do caminho", async () => {
  let assinou = false;
  const deps = withBulkDryRun(
    baseDeps({
      claimJobs: async () => [
        { id: "j1", action: "set_picture", whatsappGroupId: "111@g.us", mediaId: "m1" },
      ],
      signedMediaUrl: async () => {
        assinou = true;
        return "https://signed.local/f.jpg";
      },
    }),
  );

  await runBulkTick(deps);

  assert.equal(assinou, true, "mídia apagada tem de aparecer como falha já no dry-run");
});
