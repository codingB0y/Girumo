import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NaSuaMao, type FilaEntrada } from "./fila-vitrine";

/**
 * "Na sua mão": quem não tem telefone é respondida no grupo. O LID
 * (`100000000000001@lid`) parece telefone e não é — `wa.me/<LID>` abria uma
 * conversa com número inexistente e ainda marcava a cliente como chamada, o que
 * soltava o prazo DELA por uma falha da loja.
 */

const CLAIM = {
  id: "claim-1",
  seller_user_id: "vendedora-1",
  claimed_at: "2026-10-16T12:02:00Z",
  contacted_at: null,
};

function entrada(over: Partial<FilaEntrada> = {}): FilaEntrada {
  return {
    id: "e1",
    participant_jid: "100000000000001@lid",
    phone: null,
    push_name: "Ana",
    message_text: "eu quero",
    commented_at: "2026-10-16T12:01:00Z",
    outcome: null,
    group_invite_url: null,
    claim: CLAIM,
    ...over,
  };
}

let abertas: string[] = [];
let copiadas: string[] = [];
let acoes: string[] = [];

beforeEach(() => {
  abertas = [];
  copiadas = [];
  acoes = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { open: (url: string) => void abertas.push(url) },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: async (t: string) => void copiadas.push(t) } },
  });
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

function props(e: FilaEntrada) {
  return {
    entrada: e,
    claim: CLAIM,
    timerSeconds: 300,
    agora: new Date("2026-10-16T12:03:00Z"),
    ocupado: false,
    aoAgir: async (_id: string, acao: string) => void acoes.push(acao),
  };
}

type No = { props?: { children?: unknown; onClick?: () => unknown } };

/** Os onClick da árvore, na ordem — a mesma coisa que a vendedora pode tocar. */
function cliques(no: unknown): Array<() => unknown> {
  if (Array.isArray(no)) return no.flatMap(cliques);
  if (!no || typeof no !== "object") return [];
  const { onClick, children } = (no as No).props ?? {};
  return [...(onClick ? [onClick] : []), ...cliques(children)];
}

async function tocarTudo(e: FilaEntrada) {
  for (const clique of cliques(NaSuaMao(props(e)))) await clique();
}

test("sem telefone, com convite: responde pelo grupo e nunca abre DM", async () => {
  const e = entrada({ group_invite_url: "https://chat.whatsapp.com/AbCdEf123456" });

  const html = renderToStaticMarkup(createElement(NaSuaMao, props(e)));
  assert.match(html, /href="https:\/\/chat\.whatsapp\.com\/AbCdEf123456"/);
  assert.doesNotMatch(html, /wa\.me\//);

  await tocarTudo(e);
  assert.deepEqual(abertas.filter((u) => u.includes("wa.me/")), []);
  assert.ok(acoes.includes("contacted"));
  assert.match(copiadas[0] ?? "", /Vi seu "eu quero" no grupo/);
});

test("sem telefone e sem convite: só copia a resposta, não abre nada", async () => {
  const e = entrada();

  const html = renderToStaticMarkup(createElement(NaSuaMao, props(e)));
  assert.doesNotMatch(html, /wa\.me\//);
  assert.match(html, /cole no grupo/);

  await tocarTudo(e);
  assert.deepEqual(abertas, []);
  assert.equal(copiadas.length, 1);
});

test("com telefone de verdade, Chamar no WhatsApp vai para o telefone", () => {
  const html = renderToStaticMarkup(createElement(NaSuaMao, props(entrada({ phone: "5511999990000" }))));

  assert.match(html, /href="https:\/\/wa\.me\/5511999990000\?text=/);
  assert.doesNotMatch(html, /wa\.me\/100000000000001/);
});
