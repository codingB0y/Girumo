#!/usr/bin/env node
/**
 * Faz o Baileys confirmar (ack) as stanzas <status> de nível superior.
 *
 * O WhatsApp passou a entregar, para algumas contas, os status (stories) dos
 * contatos como stanza <status> solta, e não como <message from="status@broadcast">.
 * O Baileys 7.0.0-rc.9 (o da Evolution v2.3.7) não tem handler para ela e nunca
 * responde o ack. Uns 50 minutos depois o servidor fecha o stream
 * ("stream errored out" com <ack class="status">) e, até lá, segura todo o
 * tráfego de entrada: mensagens, recibos e avisos de participantes só chegam
 * na reconexão. Na reconexão a mesma <status> volta sem ack, e o ciclo recomeça.
 *
 * Isto é o backport, só do ack, de WhiskeySockets/Baileys#2883 (issue #2858),
 * o mesmo que evolution-foundation/evolution-api#2785 aplica via patch-package.
 * Roda no build da imagem (deploy/coolify/evolution/Dockerfile) contra o JS
 * compilado em node_modules/baileys. Idempotente: se o arquivo já trata
 * CB:status (patch anterior ou correção upstream), não mexe em nada.
 *
 * Uso: node patch-baileys-status-ack.mjs <dir do pacote baileys>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Versões cujo JS compilado teve as âncoras abaixo conferidas à mão. */
export const SUPPORTED_VERSIONS = ["7.0.0-rc.9"];

const HANDLER = `    // Girumo: ack das stanzas <status> de nivel superior. Sem ele o servidor
    // fecha o stream ~50 min depois e segura a entrada ate la.
    // Backport (so o ack) de WhiskeySockets/Baileys#2883 / issue #2858.
    const handleStatus = async (node) => {
        try {
            await sendMessageAck(node);
        }
        catch (error) {
            onUnexpectedError(error, 'acking status stanza');
        }
    };
`;

const NOTIFICATION_LISTENER = `    ws.on('CB:notification', async (node) => {
        await processNode('notification', node, 'handling notification', handleNotification);
    });
`;

const STATUS_LISTENER = `    ws.on('CB:status', async (node) => {
        await processNode('status', node, 'acking status stanza', handleStatus);
    });
`;

/** Cada âncora precisa existir exatamente uma vez; senão o arquivo não é o esperado. */
const EDITS = [
  {
    name: "offline node map",
    find: "            ['notification', handleNotification]\n        ]);",
    replace: "            ['notification', handleNotification],\n            ['status', handleStatus]\n        ]);",
  },
  {
    name: "handler definition",
    find: "    const makeOfflineNodeProcessor = () => {",
    replace: `${HANDLER}    const makeOfflineNodeProcessor = () => {`,
  },
  {
    name: "CB:status listener",
    find: NOTIFICATION_LISTENER,
    replace: NOTIFICATION_LISTENER + STATUS_LISTENER,
  },
];

export function isPatched(source) {
  return source.includes("CB:status");
}

/** Aplica as três edições no texto de lib/Socket/messages-recv.js. */
export function patchSource(source) {
  if (isPatched(source)) return { source, changed: false };
  let out = source;
  for (const edit of EDITS) {
    const first = out.indexOf(edit.find);
    if (first === -1 || out.indexOf(edit.find, first + 1) !== -1) {
      throw new Error(`anchor for "${edit.name}" not found exactly once in messages-recv.js`);
    }
    out = out.slice(0, first) + edit.replace + out.slice(first + edit.find.length);
  }
  return { source: out, changed: true };
}

/** Patcha o pacote instalado em `baileysDir` e devolve o que fez. */
export function patchBaileys(baileysDir) {
  const version = JSON.parse(readFileSync(join(baileysDir, "package.json"), "utf8")).version;
  const file = join(baileysDir, "lib", "Socket", "messages-recv.js");
  const before = readFileSync(file, "utf8");
  if (isPatched(before)) return { changed: false, version, file };
  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new Error(
      `baileys ${version} is not covered by this patch (anchors verified on ${SUPPORTED_VERSIONS.join(", ")}). ` +
        "Check whether upstream already acks <status>; if not, re-verify the anchors and add the version.",
    );
  }
  const { source } = patchSource(before);
  writeFileSync(file, source);
  return { changed: true, version, file };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node patch-baileys-status-ack.mjs <path to node_modules/baileys>");
    process.exit(2);
  }
  try {
    const r = patchBaileys(dir);
    console.log(
      r.changed ? `patched baileys ${r.version}: ${r.file}` : `baileys ${r.version} already acks <status>: ${r.file}`,
    );
  } catch (e) {
    console.error(`patch-baileys-status-ack: ${e.message}`);
    process.exit(1);
  }
}
