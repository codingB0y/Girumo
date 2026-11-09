import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { patchBaileys, patchSource } from "./patch-baileys-status-ack.mjs";

const require = createRequire(import.meta.url);

// Esqueleto do lib/Socket/messages-recv.js do baileys 7.0.0-rc.9: as três
// âncoras estão idênticas ao arquivo real; o resto foi reduzido ao que o teste
// precisa para EXECUTAR o socket patchado e ver o ack sair.
const FIXTURE = `"use strict";
const makeMessagesRecvSocket = (sock) => {
    const { ws, onUnexpectedError, acks } = sock;
    const sendMessageAck = async ({ tag, attrs, content }, errorCode) => {
        acks.push({ tag, id: attrs.id, to: attrs.from, type: attrs.type, errorCode });
    };
    const handleMessage = async (node) => node;
    const handleCall = async (node) => node;
    const handleReceipt = async (node) => node;
    const handleNotification = async (node) => node;
    const processNodeWithBuffer = async (node, identifier, exec) => {
        await exec(node, false).catch(err => onUnexpectedError(err, identifier));
    };
    const makeOfflineNodeProcessor = () => {
        const nodeProcessorMap = new Map([
            ['message', handleMessage],
            ['call', handleCall],
            ['receipt', handleReceipt],
            ['notification', handleNotification]
        ]);
        const enqueue = (type, node) => {
            const nodeProcessor = nodeProcessorMap.get(type);
            if (!nodeProcessor) {
                onUnexpectedError(new Error(\`unknown offline node type: \${type}\`), 'processing offline node');
                return;
            }
            nodeProcessor(node).catch(error => onUnexpectedError(error, 'processing offline nodes'));
        };
        return { enqueue };
    };
    const offlineNodeProcessor = makeOfflineNodeProcessor();
    const processNode = async (type, node, identifier, exec) => {
        const isOffline = !!node.attrs.offline;
        if (isOffline) {
            offlineNodeProcessor.enqueue(type, node);
        }
        else {
            await processNodeWithBuffer(node, identifier, exec);
        }
    };
    ws.on('CB:notification', async (node) => {
        await processNode('notification', node, 'handling notification', handleNotification);
    });
    ws.on('CB:ack,class:message', (node) => {
        return node;
    });
    return sock;
};
module.exports = { makeMessagesRecvSocket };
`;

function fakePackage(version, source = FIXTURE) {
  const dir = mkdtempSync(join(tmpdir(), "baileys-"));
  mkdirSync(join(dir, "lib", "Socket"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "baileys", version }));
  writeFileSync(join(dir, "lib", "Socket", "messages-recv.js"), source);
  return dir;
}

function loadPatched(dir) {
  const cjs = join(dir, "lib", "Socket", "messages-recv.cjs");
  writeFileSync(cjs, readFileSync(join(dir, "lib", "Socket", "messages-recv.js")));
  return require(cjs).makeMessagesRecvSocket;
}

const flush = () => new Promise((r) => setImmediate(r));

test("adds the handler, the offline map entry and the CB:status listener; output is valid JS", () => {
  const { source, changed } = patchSource(FIXTURE);
  assert.equal(changed, true);
  assert.match(source, /const handleStatus = async \(node\)/);
  assert.match(source, /\['notification', handleNotification\],\n\s+\['status', handleStatus\]/);
  assert.match(source, /ws\.on\('CB:status'/);
  assert.ok(source.indexOf("const handleStatus") < source.indexOf("const makeOfflineNodeProcessor"));
  const dir = fakePackage("7.0.0-rc.9", source);
  execFileSync(process.execPath, ["--check", join(dir, "lib", "Socket", "messages-recv.js")]);
});

test("the patched socket acks live and offline <status> stanzas", async () => {
  const dir = fakePackage("7.0.0-rc.9");
  patchBaileys(dir);
  const makeMessagesRecvSocket = loadPatched(dir);
  const errors = [];
  const sock = { ws: new EventEmitter(), acks: [], onUnexpectedError: (e, id) => errors.push(`${id}: ${e.message}`) };
  makeMessagesRecvSocket(sock);

  sock.ws.emit("CB:status", { tag: "status", attrs: { id: "AC1", from: "5511999@s.whatsapp.net", type: "media" } });
  sock.ws.emit("CB:status", { tag: "status", attrs: { id: "AC2", from: "5511888@s.whatsapp.net", type: "text", offline: "1" } });
  await flush();

  assert.deepEqual(sock.acks, [
    { tag: "status", id: "AC1", to: "5511999@s.whatsapp.net", type: "media", errorCode: undefined },
    { tag: "status", id: "AC2", to: "5511888@s.whatsapp.net", type: "text", errorCode: undefined },
  ]);
  assert.deepEqual(errors, []);
});

test("an ack failure is reported through onUnexpectedError, never thrown", async () => {
  const dir = fakePackage("7.0.0-rc.9");
  patchBaileys(dir);
  const makeMessagesRecvSocket = loadPatched(dir);
  const errors = [];
  const acks = { push() { throw new Error("socket closed"); } };
  const sock = { ws: new EventEmitter(), acks, onUnexpectedError: (e, id) => errors.push(`${id}: ${e.message}`) };
  makeMessagesRecvSocket(sock);

  sock.ws.emit("CB:status", { tag: "status", attrs: { id: "AC3", from: "x@s.whatsapp.net" } });
  await flush();

  assert.deepEqual(errors, ["acking status stanza: socket closed"]);
});

test("patchBaileys is idempotent and reports the version", () => {
  const dir = fakePackage("7.0.0-rc.9");
  const first = patchBaileys(dir);
  assert.equal(first.changed, true);
  assert.equal(first.version, "7.0.0-rc.9");
  const after = readFileSync(join(dir, "lib", "Socket", "messages-recv.js"), "utf8");
  const second = patchBaileys(dir);
  assert.equal(second.changed, false);
  assert.equal(readFileSync(join(dir, "lib", "Socket", "messages-recv.js"), "utf8"), after);
});

test("refuses a Baileys version whose anchors were not verified, leaving the file alone", () => {
  const dir = fakePackage("7.0.0-rc.14");
  assert.throws(() => patchBaileys(dir), /7\.0\.0-rc\.14 is not covered/);
  assert.equal(readFileSync(join(dir, "lib", "Socket", "messages-recv.js"), "utf8"), FIXTURE);
});

test("does nothing when upstream already handles CB:status, whatever the version", () => {
  const upstream = FIXTURE.replace(
    "ws.on('CB:ack,class:message'",
    "ws.on('CB:status', async (node) => { await sendMessageAck(node); });\n    ws.on('CB:ack,class:message'",
  );
  const dir = fakePackage("7.0.0-rc.14", upstream);
  assert.equal(patchBaileys(dir).changed, false);
  assert.equal(readFileSync(join(dir, "lib", "Socket", "messages-recv.js"), "utf8"), upstream);
});

test("fails loudly when an anchor is missing", () => {
  const broken = FIXTURE.replace("['notification', handleNotification]\n", "['notification', handleNotification] // moved\n");
  assert.throws(() => patchSource(broken), /anchor for "offline node map"/);
});
