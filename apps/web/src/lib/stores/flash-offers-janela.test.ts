import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { findOpenWindow, listQueue } from "./flash-offers";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o desenho de
 * `flash-offers-inicio.test.ts`). Prova que erro do banco não vira "sem janela"
 * — o webhook descartava o comentário em silêncio — e que a fila leva o convite
 * do grupo, que é por onde a vendedora responde quem não tem telefone.
 */

type Resposta = { status: number; corpo: unknown };

const pedidos: URL[] = [];
const respostas: Record<string, Resposta> = {};

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  pedidos.push(url);
  const { status, corpo } = respostas[url.pathname] ?? { status: 404, corpo: { message: "inesperado" } };
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(corpo));
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});

after(() => {
  postgrest.close();
});

const JANELA = "/rest/v1/flash_offer_groups";
const FILA = "/rest/v1/flash_offer_entries";

test("findOpenWindow: erro do banco sobe, não vira 'sem janela'", async () => {
  respostas[JANELA] = { status: 500, corpo: { code: "XX000", message: "banco fora" } };

  // Mutante: `if (error || !data) return null` — o comentário some e ninguém fica sabendo.
  await assert.rejects(findOpenWindow("loja-a", "g1@g.us"));
});

test("findOpenWindow: sem linha é null, com linha devolve a janela presa à loja", async () => {
  respostas[JANELA] = { status: 200, corpo: [] };
  assert.equal(await findOpenWindow("loja-a", "g1@g.us"), null);

  pedidos.length = 0;
  respostas[JANELA] = {
    status: 200,
    corpo: [
      {
        offer_id: "o1",
        group_id: "grp-1",
        opened_at: "2026-10-16T12:00:00+00:00",
        lid_map: { "100000000000001@lid": "5511999990000" },
        flash_offers: { keyword: "eu quero", status: "open" },
      },
    ],
  };

  const janela = await findOpenWindow("loja-a", "g1@g.us");

  assert.equal(pedidos[0].searchParams.get("tenant_id"), "eq.loja-a");
  assert.deepEqual(janela, {
    offerId: "o1",
    groupId: "grp-1",
    keyword: "eu quero",
    openedAt: "2026-10-16T12:00:00+00:00",
    lidMap: { "100000000000001@lid": "5511999990000" },
  });
});

test("listQueue traz o convite do grupo, só quando é convite de verdade", async () => {
  pedidos.length = 0;
  const base = {
    participant_jid: "100000000000001@lid",
    phone: null,
    push_name: "Ana",
    message_text: "eu quero",
    commented_at: "2026-10-16T12:01:00+00:00",
    deprioritized_at: null,
    outcome: null,
    flash_offer_claims: [],
  };
  respostas[FILA] = {
    status: 200,
    corpo: [
      { ...base, id: "e1", groups: { invite_url: "chat.whatsapp.com/AbCdEf123456" } },
      { ...base, id: "e2", groups: { invite_url: "javascript:alert(1)" } },
      { ...base, id: "e3", groups: null },
    ],
  };

  const fila = await listQueue("loja-a", "o1");

  assert.equal(pedidos[0].searchParams.get("tenant_id"), "eq.loja-a");
  assert.match(pedidos[0].searchParams.get("select") ?? "", /groups\(invite_url\)/);
  assert.deepEqual(
    fila.map((e) => [e.id, e.group_invite_url]),
    [
      ["e1", "https://chat.whatsapp.com/AbCdEf123456"],
      ["e2", null],
      ["e3", null],
    ],
  );
});
