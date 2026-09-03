import assert from "node:assert/strict";
import test from "node:test";

import { EvolutionSendError } from "./evolution-sender.js";
import {
  isRateLimited,
  resolveSendTarget,
  sendFromCommand,
  type EngineCommandRow,
  type SendDeps,
} from "./send-command.js";

// UUIDs válidos (versão 4 + variante) — `resolveMediaPath` valida o formato do
// tenant antes de aceitar o mediaId, então um UUID "1111..." seria rejeitado.
const TENANT = "11111111-1111-4111-8111-111111111111";
const INSTANCE = "22222222-2222-4222-8222-222222222222";

const MEDIA_PATH = `${TENANT}/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
const MEDIA_ID = Buffer.from(MEDIA_PATH, "utf8").toString("base64url");
/** mediaId de OUTRO tenant — deve ser rejeitado antes de qualquer envio. */
const FOREIGN_MEDIA_ID = Buffer.from(
  "99999999-9999-4999-8999-999999999999/media/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg",
  "utf8",
).toString("base64url");

type Call = { m: string; args: unknown[] };

/**
 * Deps fake que registram chamadas. `sendText` pode ser forçado a falhar para
 * exercitar o caminho de erro (breaker + retry).
 */
function fakeDeps(
  overrides: {
    instanceName?: string | null;
    sendThrows?: Error;
    signedUrl?: string | null;
  } = {},
) {
  const calls: Call[] = [];
  const deps: SendDeps = {
    async instanceName(instanceId) {
      calls.push({ m: "instanceName", args: [instanceId] });
      return overrides.instanceName === undefined ? "gr_" + INSTANCE : overrides.instanceName;
    },
    async sendText(instanceName, number, text, opts) {
      calls.push({ m: "sendText", args: [instanceName, number, text, opts] });
      if (overrides.sendThrows) throw overrides.sendThrows;
    },
    async sendMedia(instanceName, number, input) {
      calls.push({ m: "sendMedia", args: [instanceName, number, input] });
      if (overrides.sendThrows) throw overrides.sendThrows;
    },
    async sendPoll(instanceName, number, input) {
      calls.push({ m: "sendPoll", args: [instanceName, number, input] });
      if (overrides.sendThrows) throw overrides.sendThrows;
    },
    async signedMediaUrl(storagePath) {
      calls.push({ m: "signedMediaUrl", args: [storagePath] });
      return overrides.signedUrl === undefined ? "https://signed.example/x.jpg" : overrides.signedUrl;
    },
    async recordSend(instanceId, tenantId) {
      calls.push({ m: "recordSend", args: [instanceId, tenantId] });
    },
    async recordSendFailure(instanceId, tenantId, rateLimited) {
      calls.push({ m: "recordSendFailure", args: [instanceId, tenantId, rateLimited] });
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
  assert.deepEqual(send.args.slice(0, 3), ["gr_" + INSTANCE, "5511999990002", "oi"]);
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

test("429 da Evolution registra falha com rateLimited=true", async () => {
  const f = fakeDeps({ sendThrows: new EvolutionSendError(429, "rate-overlimit") });
  const out = await sendFromCommand(cmd({ jid: "5511999990002@s.whatsapp.net", text: "oi" }), f.deps);
  assert.equal(out.status, "failed");
  assert.deepEqual(f.calls.find((c) => c.m === "recordSendFailure")!.args, [INSTANCE, TENANT, true]);
});

test("falha comum registra rateLimited=false", async () => {
  const f = fakeDeps({ sendThrows: new EvolutionSendError(500, "boom") });
  const out = await sendFromCommand(cmd({ jid: "5511999990002@s.whatsapp.net", text: "oi" }), f.deps);
  assert.equal(out.status, "failed");
  assert.deepEqual(f.calls.find((c) => c.m === "recordSendFailure")!.args, [INSTANCE, TENANT, false]);
});

test("isRateLimited: só EvolutionSendError com 429 ou detalhe rate-overlimit", () => {
  assert.equal(isRateLimited(new EvolutionSendError(429, "x")), true);
  assert.equal(isRateLimited(new EvolutionSendError(500, "rate-overlimit")), true);
  assert.equal(isRateLimited(new EvolutionSendError(500, "boom")), false);
  assert.equal(isRateLimited(new Error("qualquer coisa")), false);
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

test("mentionAll é repassado ao sendText", async () => {
  const f = fakeDeps();
  await sendFromCommand(cmd({ jid: "12036@g.us", text: "oferta", mentionAll: true }), f.deps);
  const send = f.calls.find((c) => c.m === "sendText")!;
  assert.deepEqual(send.args[3], { mentionAll: true });
});

// --- send_media ---

test("send_media: assina a URL NA HORA e envia com caption + mediatype", async () => {
  const f = fakeDeps();
  const out = await sendFromCommand(
    cmd({ jid: "12036@g.us", mediaId: MEDIA_ID, mediaType: "image", caption: "promo" }, { type: "send_media" }),
    f.deps,
  );
  assert.equal(out.status, "sent");
  // A assinatura acontece depois de resolver a instância, no momento do envio.
  assert.deepEqual(f.names(), ["instanceName", "signedMediaUrl", "sendMedia", "recordSend", "completeCommand"]);
  assert.deepEqual(f.calls.find((c) => c.m === "signedMediaUrl")!.args, [MEDIA_PATH]);
  const send = f.calls.find((c) => c.m === "sendMedia")!;
  assert.equal(send.args[1], "12036@g.us");
  assert.deepEqual(send.args[2], {
    media: "https://signed.example/x.jpg",
    mediatype: "image",
    caption: "promo",
    mentionAll: false,
  });
});

test("send_media: mediaId de OUTRO tenant é rejeitado antes de assinar ou enviar", async () => {
  const f = fakeDeps();
  const out = await sendFromCommand(
    cmd({ jid: "12036@g.us", mediaId: FOREIGN_MEDIA_ID }, { type: "send_media" }),
    f.deps,
  );
  assert.equal(out.status, "failed");
  assert.equal(out.reason, "bad-payload");
  assert.equal(f.calls.some((c) => c.m === "signedMediaUrl"), false);
  assert.equal(f.calls.some((c) => c.m === "sendMedia"), false);
});

test("send_media: mídia sumida do storage falha sem marcar o número", async () => {
  const f = fakeDeps({ signedUrl: null });
  const out = await sendFromCommand(
    cmd({ jid: "12036@g.us", mediaId: MEDIA_ID }, { type: "send_media" }),
    f.deps,
  );
  assert.equal(out.status, "failed");
  assert.equal(f.calls.some((c) => c.m === "sendMedia"), false);
});

test("send_media: mediaType inválido cai para image", async () => {
  const f = fakeDeps();
  await sendFromCommand(
    cmd({ jid: "12036@g.us", mediaId: MEDIA_ID, mediaType: "sticker" }, { type: "send_media" }),
    f.deps,
  );
  const send = f.calls.find((c) => c.m === "sendMedia")!;
  assert.equal((send.args[2] as { mediatype: string }).mediatype, "image");
});

// --- send_poll ---

test("send_poll: envia pergunta + opções", async () => {
  const f = fakeDeps();
  const out = await sendFromCommand(
    cmd({ jid: "12036@g.us", question: "Qual cor?", options: ["Azul", "Verde"] }, { type: "send_poll" }),
    f.deps,
  );
  assert.equal(out.status, "sent");
  const send = f.calls.find((c) => c.m === "sendPoll")!;
  assert.deepEqual(send.args[2], { question: "Qual cor?", options: ["Azul", "Verde"] });
});

test("send_poll: menos de 2 opções falha antes da rede (WhatsApp exige 2+)", async () => {
  const f = fakeDeps();
  const out = await sendFromCommand(
    cmd({ jid: "12036@g.us", question: "Só uma?", options: ["Azul"] }, { type: "send_poll" }),
    f.deps,
  );
  assert.equal(out.status, "failed");
  assert.equal(out.reason, "bad-payload");
  assert.equal(f.calls.some((c) => c.m === "sendPoll"), false);
});
