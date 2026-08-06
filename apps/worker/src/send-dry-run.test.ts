import assert from "node:assert/strict";
import test from "node:test";

import type { SendDeps } from "./send-command.js";
import { withDryRun } from "./send-dry-run.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const INSTANCE = "22222222-2222-4222-8222-222222222222";
const GROUP = "120363000000000000@g.us";
const PESSOA = "556299999999@s.whatsapp.net";

type Call = { m: string; args: unknown[] };

function fakeDeps() {
  const calls: Call[] = [];
  const push = (m: string) => (...args: unknown[]) => {
    calls.push({ m, args });
    return Promise.resolve();
  };
  const deps: SendDeps = {
    instanceName: (async (id: string) => {
      calls.push({ m: "instanceName", args: [id] });
      return "gr_" + INSTANCE;
    }) as SendDeps["instanceName"],
    sendText: push("sendText") as SendDeps["sendText"],
    sendMedia: push("sendMedia") as SendDeps["sendMedia"],
    sendPoll: push("sendPoll") as SendDeps["sendPoll"],
    signedMediaUrl: (async (p: string) => {
      calls.push({ m: "signedMediaUrl", args: [p] });
      return "https://signed.example/x";
    }) as SendDeps["signedMediaUrl"],
    recordSend: push("recordSend") as SendDeps["recordSend"],
    recordSendFailure: push("recordSendFailure") as SendDeps["recordSendFailure"],
    completeCommand: push("completeCommand") as SendDeps["completeCommand"],
  };
  return { deps, calls };
}

/** Captura o stdout do log estruturado durante `fn`. */
async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (line: unknown) => {
    lines.push(String(line));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines;
}

test("dry-run nao chama nenhum dos tres envios reais", async () => {
  const { deps, calls } = fakeDeps();
  const dry = withDryRun(deps);

  await captureLogs(async () => {
    await dry.sendText("gr_x", GROUP, "oi", undefined);
    await dry.sendMedia("gr_x", GROUP, { media: "https://x", mediatype: "image" });
    await dry.sendPoll("gr_x", GROUP, { question: "q", options: ["a", "b"] });
  });

  assert.deepEqual(
    calls.map((c) => c.m),
    [],
    "nenhuma chamada deveria ter chegado nas deps reais",
  );
});

test("dry-run preserva o resto das deps — record_send e complete continuam reais", async () => {
  const { deps, calls } = fakeDeps();
  const dry = withDryRun(deps);

  await dry.recordSend(INSTANCE, TENANT);
  await dry.completeCommand("cmd-1", true);
  await dry.instanceName(INSTANCE);
  await dry.signedMediaUrl(`${TENANT}/media/x.jpg`);

  assert.deepEqual(calls.map((c) => c.m), [
    "recordSend",
    "completeCommand",
    "instanceName",
    "signedMediaUrl",
  ]);
});

test("dry-run loga o JID do grupo, mas nunca o texto", async () => {
  const { deps } = fakeDeps();
  const dry = withDryRun(deps);

  const lines = await captureLogs(async () => {
    await dry.sendText("gr_x", GROUP, "promocao secreta do lojista", { mentionAll: true });
  });

  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(entry.msg, "DRY-RUN: enviaria texto");
  assert.equal(entry.destino, GROUP);
  assert.equal(entry.chars, "promocao secreta do lojista".length);
  assert.equal(entry.mention_all, true);
  assert.ok(!lines[0].includes("promocao"), "o texto da mensagem nao pode ir para o log");
});

test("destino que nao e grupo vai mascarado — PII fora do log e violacao anti-DM visivel", async () => {
  const { deps } = fakeDeps();
  const dry = withDryRun(deps);

  const lines = await captureLogs(async () => {
    await dry.sendText("gr_x", PESSOA, "oi", undefined);
  });

  const entry = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(entry.destino, "<nao-grupo>");
  assert.ok(!lines[0].includes("556299999999"), "numero de pessoa nao pode ir para o log");
});

test("dry-run de midia loga o tipo e se tem caption, sem o caption", async () => {
  const { deps } = fakeDeps();
  const dry = withDryRun(deps);

  const lines = await captureLogs(async () => {
    await dry.sendMedia("gr_x", GROUP, {
      media: "https://signed.example/x",
      mediatype: "image",
      caption: "leve 3 pague 2",
    });
  });

  const entry = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(entry.msg, "DRY-RUN: enviaria midia");
  assert.equal(entry.mediatype, "image");
  assert.equal(entry.tem_caption, true);
  assert.ok(!lines[0].includes("leve 3"), "o caption nao pode ir para o log");
});

test("dry-run de enquete loga a contagem de opcoes, sem a pergunta", async () => {
  const { deps } = fakeDeps();
  const dry = withDryRun(deps);

  const lines = await captureLogs(async () => {
    await dry.sendPoll("gr_x", GROUP, { question: "qual sabor?", options: ["a", "b", "c"] });
  });

  const entry = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(entry.msg, "DRY-RUN: enviaria enquete");
  assert.equal(entry.opcoes, 3);
  assert.ok(!lines[0].includes("sabor"), "a pergunta nao pode ir para o log");
});
