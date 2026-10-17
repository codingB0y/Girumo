import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { espelharComunidadesNativas } from "./communities";

/**
 * O espelho de comunidade nativa contra um PostgREST de mentira (desenho de
 * `campaign-groups-conflitos.test.ts`). Um grupo, uma campanha: o espelho grava o que o WhatsApp
 * diz MENOS o que já é de outra campanha e ainda não é da gaveta — senão o trigger recusaria a
 * escrita inteira, a cada sync. O que a gaveta já tinha nunca sai sozinho.
 */

type Pedido = { metodo: string; url: URL; corpo: unknown };

const pedidos: Pedido[] = [];
let tabelas: Record<string, unknown> = {};
let escrita: { status: number; corpo: unknown } = { status: 200, corpo: [] };

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte.toString("utf8")));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://postgrest.falso");
    const metodo = req.method ?? "";
    pedidos.push({ metodo, url, corpo: bruto ? JSON.parse(bruto) : null });

    let status = 200;
    let corpo: unknown = [];
    if (metodo === "GET") {
      // Cada leitura do espelho tem um filtro que só ela usa.
      if (url.pathname === "/rest/v1/groups") {
        corpo = url.searchParams.has("community_role") ? tabelas.avisos : tabelas.grupos;
      } else if (url.pathname === "/rest/v1/campaign_groups") {
        corpo = url.searchParams.has("whatsapp_community_jid") ? tabelas.gavetas : tabelas.campanhas;
      }
    } else {
      ({ status, corpo } = escrita);
    }
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(corpo));
  });
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

const COMUNIDADE = "120363777@g.us";
const GAVETA = "6a7e0000-0000-4000-8000-0000000000d1";
const OUTRA = "6a7e0000-0000-4000-8000-0000000000c1";

function filho(jid: string) {
  return { whatsapp_group_id: jid, name: jid, is_admin: true, community_jid: COMUNIDADE, community_role: "member" };
}

/** O que o WhatsApp diz hoje: o pai e os filhos g1..g4 da comunidade. */
const GRUPOS_DO_WHATSAPP = [
  { whatsapp_group_id: "pai@g.us", name: "Comunidade X", is_admin: true, community_jid: COMUNIDADE, community_role: "parent" },
  filho("g1"),
  filho("g2"),
  filho("g3"),
  filho("g4"),
];

function campanha(id: string, slug: string, groupIds: string[], jid: string | null = null) {
  return { id, name: slug, slug, group_ids: groupIds, auto_grow: false, whatsapp_community_jid: jid };
}

function montar(over: { gavetas: unknown[]; campanhas: unknown[]; escrita?: { status: number; corpo: unknown } }) {
  pedidos.length = 0;
  tabelas = { grupos: GRUPOS_DO_WHATSAPP, avisos: [], gavetas: over.gavetas, campanhas: over.campanhas };
  escrita = over.escrita ?? { status: 200, corpo: [] };
}

test("gaveta existente: grupo novo de outra campanha não entra, e o que a gaveta já tinha continua", async () => {
  // g2 está na gaveta E em OUTRA (conflito de antes do trigger): fica. g3 só é da OUTRA: não entra.
  // g4 é livre: entra. g1 já era da gaveta.
  montar({
    gavetas: [{ id: GAVETA, slug: "comunidade-x", whatsapp_community_jid: COMUNIDADE }],
    campanhas: [
      campanha(GAVETA, "comunidade-x", ["g1", "g2"], COMUNIDADE),
      campanha(OUTRA, "outra", ["g2", "g3"]),
    ],
  });

  assert.equal(await espelharComunidadesNativas("loja-a"), 1);

  const [update] = pedidos.filter((p) => p.metodo === "PATCH");
  assert.deepEqual(update.corpo, { name: "Comunidade X", group_ids: ["g1", "g2", "g4"] });
  assert.equal(update.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(update.url.searchParams.get("id"), `eq.${GAVETA}`);
  // Mutante: filtrar sem a linha da própria gaveta em `campanhas` trataria g2 como entrada nova
  // de outra campanha e o tiraria da gaveta sozinho (D4: nada sai sozinho).
});

test("gaveta nova: o insert já nasce sem o grupo que é de outra campanha", async () => {
  // O insert falha de propósito (500) logo depois de o corpo ser lido: o link mestre fica fora do teste.
  montar({
    gavetas: [],
    campanhas: [campanha(OUTRA, "outra", ["g1", "g3"])],
    escrita: { status: 500, corpo: { code: "XX000", details: null, hint: null, message: "parou no insert" } },
  });

  await assert.rejects(espelharComunidadesNativas("loja-a"), /parou no insert/);

  const [insert] = pedidos.filter((p) => p.metodo === "POST");
  const linha = (Array.isArray(insert.corpo) ? insert.corpo[0] : insert.corpo) as {
    tenant_id: string;
    group_ids: string[];
    whatsapp_community_jid: string;
  };
  assert.equal(linha.tenant_id, "loja-a");
  assert.equal(linha.whatsapp_community_jid, COMUNIDADE);
  assert.deepEqual(linha.group_ids, ["g2", "g4"]);
});
