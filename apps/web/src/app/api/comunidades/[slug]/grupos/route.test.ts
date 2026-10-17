import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { POST as RotaPost } from "./route";

/**
 * POST /api/comunidades/[slug]/grupos contra um Supabase de mentira (desenho de
 * `campanhas/route.test.ts`). Vincular o grupo é um append pela RPC atômica, que passa pelo
 * trigger `campaign_groups_grupo_exclusivo`: se ele recusar, a tela de comunidades recebe o 409
 * do contrato com `data.error` pronto para mostrar; qualquer outro erro continua sendo 500.
 */

const OUTRA = "6a7e0000-0000-4000-8000-0000000000c1";
const COMUNIDADE = "6a7e0000-0000-4000-8000-0000000000d1";
const JID = "120363001@g.us";
const RPC_APPEND = "/rest/v1/rpc/campaign_group_append_group_id";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let append: Resposta = { status: 500 };

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

function gaveta(id: string, name: string, slug: string) {
  return { id, name, slug, group_ids: [], auto_grow: false, whatsapp_community_jid: null };
}

function responder({ metodo, url }: Chamada): Resposta {
  const { pathname, searchParams } = url;
  if (pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
  if (pathname === "/rest/v1/memberships") {
    return { status: 200, corpo: [{ tenant_id: "loja-a", role: "owner", modules: [] }] };
  }
  if (pathname === "/rest/v1/groups") {
    // O grupo pertence à loja (`grupoPertenceAoTenant`); o resto é a leitura do Avisos.
    return { status: 200, corpo: searchParams.has("community_role") ? [] : [{ id: "grupo-1" }] };
  }
  if (pathname === "/rest/v1/campaign_groups" && metodo === "GET") {
    const id = searchParams.get("id");
    if (id === `eq.${OUTRA}`) return { status: 200, corpo: [{ ...gaveta(OUTRA, "Moda Kids do Sul", "moda-kids"), tenant_id: "loja-a" }] };
    // `buscarIdPorSlug` filtra por slug; `listarComunidades` (recusarSeNativa) não filtra.
    return { status: 200, corpo: [gaveta(COMUNIDADE, "Verao", "verao")] };
  }
  if (pathname === RPC_APPEND) return append;
  return { status: 500, corpo: { message: `inesperado: ${metodo} ${pathname}` } };
}

let POST: typeof RotaPost;

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  ({ POST } = await import("./route"));
});

after(() => {
  supabase.close();
});

function vincular(): Promise<Response> {
  return POST(
    new Request("http://girumo.test/api/comunidades/verao/grupos", {
      method: "POST",
      headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-a", "content-type": "application/json" },
      body: JSON.stringify({ whatsappGroupId: JID }),
    }),
    { params: Promise.resolve({ slug: "verao" }) },
  );
}

test("vincular grupo que já é de outra campanha: 409 do contrato", async () => {
  chamadas.length = 0;
  // 409 é o que o PostgREST devolve para unique_violation (23505). Não usar 503/520: o
  // postgrest-js repete com espera.
  append = {
    status: 409,
    corpo: { code: "23505", details: null, hint: null, message: `grupo_em_outra_campanha:${JID}:${OUTRA}` },
  };

  const res = await vincular();

  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), {
    error: "Um dos grupos já está na campanha “Moda Kids do Sul”. Cada grupo fica em uma campanha só — tire de lá primeiro.",
    grupo: JID,
    campanha: { id: OUTRA, name: "Moda Kids do Sul" },
  });
  // O append foi pedido para a gaveta desta loja, com o grupo certo.
  const [rpc] = chamadas.filter((c) => c.url.pathname === RPC_APPEND);
  assert.deepEqual(rpc.corpo, { p_tenant_id: "loja-a", p_id: COMUNIDADE, p_whatsapp_group_id: JID });
});

test("vincular grupo livre: ok", async () => {
  chamadas.length = 0;
  append = { status: 200, corpo: null };

  const res = await vincular();

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("vincular com erro que não é a recusa do trigger: continua 500", async () => {
  chamadas.length = 0;
  append = { status: 500, corpo: { code: "XX000", details: null, hint: null, message: "banco fora do ar" } };
  const consoleError = console.error;
  console.error = () => undefined; // a rota loga a falha; o teste só confere a resposta
  try {
    const res = await vincular();

    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "Erro ao vincular o grupo." });
  } finally {
    console.error = consoleError;
  }
});
