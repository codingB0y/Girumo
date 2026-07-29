import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveSendTarget,
  sendFromCommand,
  type EngineCommandRow,
  type SendDeps,
} from "./send-command.js";

const TENANT = "11111111-1111-1111-1111-111111111111";
const INSTANCE = "22222222-2222-2222-2222-222222222222";

type Call = { m: string; args: unknown[] };

/**
 * Deps fake que registram chamadas. `sendText` pode ser forçado a falhar para
 * exercitar o caminho de erro (breaker + retry).
 */
function fakeDeps(overrides: { instanceName?: string | null; sendThrows?: Error } = {}) {
  const calls: Call[] = [];
  const deps: SendDeps = {
    async instanceName(instanceId) {
      calls.push({ m: "instanceName", args: [instanceId] });
      return overrides.instanceName === undefined ? "gr_" + INSTANCE : overrides.instanceName;
    },
    async sendText(instanceName, number, text) {
      calls.push({ m: "sendText", args: [instanceName, number, text] });
      if (overrides.sendThrows) throw overrides.sendThrows;
    },
    async recordSend(instanceId, tenantId) {
      calls.push({ m: "recordSend", args: [instanceId, tenantId] });
    },
    async recordSendFailure(instanceId, tenantId) {
      calls.push({ m: "recordSendFailure", args: [instanceId, tenantId] });
    },
    async completeCommand(commandId, success, errorMessage) {
      calls.push({ m: "completeCommand", args: [commandId, success, errorMessage] });
    },
  };
  return { deps, calls, names: () => calls.map((c) => c.m) };
}

function cmd(payload: unknown, over: Partial<EngineCommandRow> = {}): EngineCommandRow {
  return {
    command_id: "cmd-1",
    tenant_id: TENANT,
    instance_id: INSTANCE,
    type: "send_message",
    payload,
    ...over,
  };
}

// --- resolveSendTarget (mapeamento do contrato {jid,text}) ---

test("resolveSendTarget: jid pessoa vira só o número", () => {
  const t = resolveSendTarget({ jid: "5511999990002@s.whatsapp.net", text: "oi" });
  assert.equal(t.number, "5511999990002");
  assert.equal(t.text, "oi");
});

test("resolveSendTarget: jid de grupo mantém o jid inteiro", () => {
  const t = resolveSendTarget({ jid: "12036120363099999999999@g.us", text: "promo" });
  assert.equal(t.number, "12036120363099999999999@g.us");
});

test("resolveSendTarget: jid @lid usa a parte antes do @", () => {
  const t = resolveSendTarget({ jid: "20100000000000009@lid", text: "oi" });
  assert.equal(t.number, "20100000000000009");
});

test("resolveSendTarget: fallback para phone e message (compat legado)", () => {
  const t = resolveSendTarget({ phone: "+55 (11) 99999-0002", message: "olá" });
  assert.equal(t.number, "5511999990002");
  assert.equal(t.text, "olá");
});

test("resolveSendTarget: sem alvo lança", () => {
  assert.throws(() => resolveSendTarget({ text: "oi" }), /jid ou payload\.phone/);
});

test("resolveSendTarget: sem texto lança", () => {
  assert.throws(() => resolveSendTarget({ jid: "5511999990002@s.whatsapp.net" }), /payload\.text/);
});

// --- sendFromCommand (decisão por comando) ---

test("envio OK: sendText → recordSend → completeCommand(true)", async () => {
  const f = fakeDeps();
  const out = await sendFromCommand(cmd({ jid: "5511999990002@s.whatsapp.net", text: "oi" }), f.deps);
  assert.equal(out.status, "sent");
  assert.deepEqual(f.names(), ["instanceName", "sendText", "recordSend", "completeCommand"]);
  const send = f.calls.find((c) => c.m === "sendText")!;
  assert.deepEqual(send.args, ["gr_" + INSTANCE, "5511999990002", "oi"]);
  const complete = f.calls.find((c) => c.m === "completeCommand")!;
  assert.equal(complete.args[1], true);
});

test("falha de envio: recordSendFailure (breaker) + completeCommand(false), sem recordSend", async () => {
  const f = fakeDeps({ sendThrows: new Error("Evolution sendText falhou (500)") });
  const out = await sendFromCommand(cmd({ jid: "5511999990002@s.whatsapp.net", text: "oi" }), f.deps);
  assert.equal(out.status, "failed");
  assert.equal(out.reason, "send-error");
  assert.deepEqual(f.names(), ["instanceName", "sendText", "recordSendFailure", "completeCommand"]);
  assert.equal(f.calls.find((c) => c.m === "completeCommand")!.args[1], false);
  assert.equal(f.calls.some((c) => c.m === "recordSend"), false);
});

test("payload ruim: completeCommand(false) sem tocar no número (nem sendText nem breaker)", async () => {
  const f = fakeDeps();
  const out = await sendFromCommand(cmd({ jid: "5511999990002@s.whatsapp.net" }), f.deps);
  assert.equal(out.status, "failed");
  assert.equal(out.reason, "bad-payload");
  assert.equal(f.calls.some((c) => c.m === "sendText"), false);
  assert.equal(f.calls.some((c) => c.m === "recordSendFailure"), false);
  assert.equal(f.calls.find((c) => c.m === "completeCommand")!.args[1], false);
});

test("instância sem provider_instance_id: falha sem enviar", async () => {
  const f = fakeDeps({ instanceName: null });
  const out = await sendFromCommand(cmd({ jid: "5511999990002@s.whatsapp.net", text: "oi" }), f.deps);
  assert.equal(out.status, "failed");
  assert.equal(out.reason, "no-provider-name");
  assert.equal(f.calls.some((c) => c.m === "sendText"), false);
});

test("comando sem instance_id: falha determinística", async () => {
  const f = fakeDeps();
  const out = await sendFromCommand(cmd({ jid: "x@s.whatsapp.net", text: "oi" }, { instance_id: null }), f.deps);
  assert.equal(out.status, "failed");
  assert.equal(out.reason, "no-instance");
  assert.equal(f.calls.some((c) => c.m === "instanceName"), false);
});

test("tipo inesperado (defensivo): falha sem enviar", async () => {
  const f = fakeDeps();
  const out = await sendFromCommand(cmd({ jid: "x@s.whatsapp.net", text: "oi" }, { type: "refresh_status" }), f.deps);
  assert.equal(out.status, "failed");
  assert.equal(out.reason, "unexpected-type");
  assert.equal(f.calls.some((c) => c.m === "sendText"), false);
});
