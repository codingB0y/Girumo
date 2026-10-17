import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { PATCH as RotaPatch, POST as RotaPost } from "./route";

/**
 * POST/PATCH /api/campanhas contra um Supabase de mentira (desenho de `[slug]/messages/route.test.ts`).
 * Um grupo, uma campanha: quando o trigger `campaign_groups_grupo_exclusivo` recusa a escrita, a
 * rota responde o 409 do contrato (`{ error, grupo, campanha }`); qualquer outro erro continua
 * subindo — nunca vira 409 por engano. Só o ramo Supabase (o JSON legado está fora do escopo).
 */

const OUTRA = "6a7e0000-0000-4000-8000-0000000000c1";
const ESTA = "6a7e0000-0000-4000-8000-0000000000e1";
const JID = "120363001@g.us";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let escrita: Resposta = { status: 500 };

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte.toString("utf8")));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(corpo ?? null));
  });
});

/** Linha de `campaign_groups` como o banco devolve. */
function linha(id: string, name: string, groupIds: string[] = []) {
  return {
    id,
    tenant_id: "loja-a",
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    group_ids: groupIds,
    auto_grow: false,
    grow_template: null,
    metadata: {},
    whatsapp_community_jid: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
}

function responder({ metodo, url }: Chamada): Resposta {
  const { pathname } = url;
  if (pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
  if (pathname === "/rest/v1/memberships") {
    return { status: 200, corpo: [{ tenant_id: "loja-a", role: "owner", modules: [] }] };
  }
  // Plano sem teto: `assertPlanLimit` deixa passar.
  if (pathname === "/rest/v1/subscriptions") {
    return { status: 200, corpo: [{ status: "active", metadata: {}, current_period_end: null, plans: { limits: {} } }] };
  }
  if (pathname === "/rest/v1/tracked_links" && metodo === "GET") return { status: 200, corpo: [] };
  if (pathname === "/rest/v1/campaign_groups") {
    if (metodo !== "GET") return escrita;
    const id = url.searchParams.get("id");
    if (id === `eq.${OUTRA}`) return { status: 200, corpo: [linha(OUTRA, "Moda Kids do Sul", [JID])] };
    if (id === `eq.${ESTA}`) return { status: 200, corpo: [linha(ESTA, "Verao", [])] };
    return { status: 200, corpo: [] }; // listCampaignGroups: a loja ainda não tem campanha
  }
  return { status: 500, corpo: { message: `inesperado: ${metodo} ${pathname}` } };
}

let POST: typeof RotaPost;
let PATCH: typeof RotaPatch;

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  // O modo Supabase tem que valer antes de a rota carregar: `USE_SUPABASE` é lido no import.
  process.env.HUBFLOW_USE_SUPABASE = "1";
  ({ POST, PATCH } = await import("./route"));
});

after(() => {
  supabase.close();
});

// 409 é o que o PostgREST devolve para unique_violation (23505). Não usar 503/520: o
// postgrest-js repete com espera.
const RECUSA: Resposta = {
  status: 409,
  corpo: { code: "23505", details: null, hint: null, message: `grupo_em_outra_campanha:${JID}:${OUTRA}` },
};

function pedir(metodo: "POST" | "PATCH", corpo: unknown): Request {
  return new Request("http://girumo.test/api/campanhas", {
    method: metodo,
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-a", "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

const ESPERADO_409 = {
  error: "Um dos grupos já está na campanha “Moda Kids do Sul”. Cada grupo fica em uma campanha só — tire de lá primeiro.",
  grupo: JID,
  campanha: { id: OUTRA, name: "Moda Kids do Sul" },
};

test("POST com grupo que já é de outra campanha: 409 do contrato, sem link mestre", async () => {
  chamadas.length = 0;
  escrita = RECUSA;

  const res = await POST(pedir("POST", { name: "Verao", groupIds: [JID] }));

  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), ESPERADO_409);
  const [insert] = feitas("POST", "/rest/v1/campaign_groups");
  const corpo = (Array.isArray(insert.corpo) ? insert.corpo[0] : insert.corpo) as { tenant_id: string; group_ids: string[] };
  assert.equal(corpo.tenant_id, "loja-a");
  assert.deepEqual(corpo.group_ids, [JID]);
  // A campanha nem nasceu: criar o link mestre aqui deixaria link morto para uma campanha que não existe.
  assert.equal(feitas("POST", "/rest/v1/tracked_links").length, 0);
  // O nome da outra campanha é lido SÓ da loja da rota.
  const [lido] = feitas("GET", "/rest/v1/campaign_groups").filter((c) => c.url.searchParams.get("id") === `eq.${OUTRA}`);
  assert.equal(lido.url.searchParams.get("tenant_id"), "eq.loja-a");
});

test("POST com erro que não é a recusa do trigger: sobe, não vira 409", async () => {
  chamadas.length = 0;
  escrita = { status: 500, corpo: { code: "XX000", details: null, hint: null, message: "banco fora do ar" } };

  await assert.rejects(POST(pedir("POST", { name: "Verao", groupIds: [JID] })), /banco fora do ar/);
});

test("PATCH de grupos recusado pelo trigger: 409 do contrato", async () => {
  chamadas.length = 0;
  escrita = RECUSA;

  const res = await PATCH(pedir("PATCH", { id: ESTA, groupIds: [JID] }));

  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), ESPERADO_409);
  const [update] = feitas("PATCH", "/rest/v1/campaign_groups");
  assert.deepEqual(update.corpo, { group_ids: [JID] });
  assert.equal(update.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(update.url.searchParams.get("id"), `eq.${ESTA}`);
});

test("PATCH com erro que não é a recusa do trigger: sobe, não vira 409", async () => {
  chamadas.length = 0;
  escrita = { status: 500, corpo: { code: "XX000", details: null, hint: null, message: "banco fora do ar" } };

  await assert.rejects(PATCH(pedir("PATCH", { id: ESTA, groupIds: [JID] })), /banco fora do ar/);
});
