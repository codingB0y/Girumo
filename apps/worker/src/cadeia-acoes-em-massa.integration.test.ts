import assert from "node:assert/strict";
import test from "node:test";

import { runBulkTick, type BulkDeps, type BulkJobClaim } from "./bulk-loop.js";

/**
 * Cadeia das ações em massa: fila com 4 ações → quatro ticks → quatro chamadas
 * DISTINTAS na Evolution → quatro acks `done`, um por job.
 *
 * O unitário prova cada elo. Este prova o que só quebra ENTRE os elos: que a
 * `action` que sai do claim é a que chega na chamada certa, e que o teto de
 * ritmo drena a fila sem perder nada nem disparar rajada. É o defeito que passa
 * quando os dois lados evoluem separados.
 */
test("a fila drena um job por tick, cada acao na chamada certa", async () => {
  const fila: BulkJobClaim[] = [
    { id: "j1", action: "close", whatsappGroupId: "111@g.us" },
    { id: "j2", action: "set_description", whatsappGroupId: "222@g.us", description: "Bazar VIP" },
    { id: "j3", action: "set_picture", whatsappGroupId: "333@g.us", mediaId: "m1" },
    { id: "j4", action: "open", whatsappGroupId: "444@g.us" },
  ];

  const chamadas: string[] = [];
  const acks: Array<{ id: string; status: string }> = [];

  const deps: BulkDeps = {
    listTenants: async () => ["t1"],
    // Espelha a RPC `claim_bulk_jobs`: entrega no máximo um, na ordem de criação.
    claimJobs: async () => fila.splice(0, 1),
    ack: async (_t, id, ack) => {
      acks.push({ id, status: ack.status });
    },
    instanceFor: async () => "girumo-1",
    setOpenToAll: async (_i, jid) => {
      chamadas.push(`open:${jid}`);
    },
    setAnnounceOnly: async (_i, jid) => {
      chamadas.push(`close:${jid}`);
    },
    setDescription: async (_i, jid, texto) => {
      chamadas.push(`desc:${jid}:${texto}`);
    },
    setPicture: async (_i, jid, url) => {
      chamadas.push(`foto:${jid}:${url}`);
    },
    signedMediaUrl: async (mediaId) => `https://signed.local/${mediaId}.jpg`,
  };

  for (let i = 0; i < 4; i += 1) await runBulkTick(deps);

  assert.deepEqual(chamadas, [
    "close:111@g.us",
    "desc:222@g.us:Bazar VIP",
    "foto:333@g.us:https://signed.local/m1.jpg",
    "open:444@g.us",
  ]);
  assert.deepEqual(acks, [
    { id: "j1", status: "done" },
    { id: "j2", status: "done" },
    { id: "j3", status: "done" },
    { id: "j4", status: "done" },
  ]);

  // Um quinto tick com a fila vazia não pode inventar trabalho.
  const vazio = await runBulkTick(deps);
  assert.equal(vazio.claimed, 0);
  assert.equal(vazio.done, 0);
});

test("um grupo que recusa nao derruba o resto do lote", async () => {
  // A razão de existir um job por (grupo x ação): 1 grupo onde perdemos o admin
  // não pode obrigar os outros a repetir — repetir é o que gasta janela anti-ban.
  const fila: BulkJobClaim[] = [
    { id: "j1", action: "close", whatsappGroupId: "111@g.us" },
    { id: "j2", action: "close", whatsappGroupId: "SEM-ADMIN@g.us" },
    { id: "j3", action: "close", whatsappGroupId: "333@g.us" },
  ];

  const aplicados: string[] = [];
  const acks: Array<{ id: string; status: string }> = [];

  const deps: BulkDeps = {
    listTenants: async () => ["t1"],
    claimJobs: async () => fila.splice(0, 1),
    ack: async (_t, id, ack) => {
      acks.push({ id, status: ack.status });
    },
    instanceFor: async () => "girumo-1",
    setOpenToAll: async () => {},
    setAnnounceOnly: async (_i, jid) => {
      if (jid.startsWith("SEM-ADMIN")) {
        throw new Error("Evolution group/updateSetting falhou (403): not admin");
      }
      aplicados.push(jid);
    },
    setDescription: async () => {},
    setPicture: async () => {},
    signedMediaUrl: async () => null,
  };

  for (let i = 0; i < 3; i += 1) await runBulkTick(deps);

  assert.deepEqual(aplicados, ["111@g.us", "333@g.us"], "o terceiro grupo tem de ser aplicado");
  assert.deepEqual(acks, [
    { id: "j1", status: "done" },
    { id: "j2", status: "failed" },
    { id: "j3", status: "done" },
  ]);
});
