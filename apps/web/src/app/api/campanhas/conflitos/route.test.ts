import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, mock, test } from "node:test";

import { GRUPO_SAIU_DA_CAMPANHA } from "@/lib/campaigns/conflito-grupo";
import type { GET as RotaGet, POST as RotaPost } from "./route";

/**
 * GET/POST /api/campanhas/conflitos contra um Supabase de mentira (desenho de
 * `../route.test.ts`). O que importa aqui é o que a rota FAZ com o banco: lê só a loja do
 * chamador, tira o grupo de toda campanha que o tem MENOS a escolhida, e nunca tira quando a
 * escolhida já não o tem (o grupo ficaria sem campanha nenhuma).
 */

const LOJA = "loja-a";
const JID = "120363001@g.us";
const A = "6a7e0000-0000-4000-8000-0000000000a1";
const B = "6a7e0000-0000-4000-8000-0000000000b2";
const C = "6a7e0000-0000-4000-8000-0000000000c3";
const D = "6a7e0000-0000-4000-8000-0000000000d4";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let papel = "owner";
let campanhas: Array<ReturnType<typeof linha>> = [];
let remocao: Resposta = { status: 200, corpo: {} };
let conflitos: unknown[] = [];

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
function linha(id: string, name: string, groupIds: string[]) {
  return {
    id,
    tenant_id: LOJA,
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
    return { status: 200, corpo: [{ tenant_id: LOJA, role: papel, modules: [] }] };
  }
  if (pathname === "/rest/v1/campaign_groups" && metodo === "GET") return { status: 200, corpo: campanhas };
  if (pathname === "/rest/v1/rpc/campaign_group_remove_group_id") return remocao;
  if (pathname === "/rest/v1/rpc/grupos_em_mais_de_uma_campanha") return { status: 200, corpo: conflitos };
  return { status: 500, corpo: { message: `inesperado: ${metodo} ${pathname}` } };
}

let GET: typeof RotaGet;
let POST: typeof RotaPost;

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  ({ GET, POST } = await import("./route"));
});

after(() => {
  supabase.close();
});

function pedir(metodo: "GET" | "POST", corpo?: unknown): Request {
  return new Request("http://girumo.test/api/campanhas/conflitos", {
    method: metodo,
    headers: { authorization: "Bearer token-falso", "x-tenant-id": LOJA, "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

function reiniciar(): void {
  chamadas.length = 0;
  papel = "owner";
  campanhas = [];
  remocao = { status: 200, corpo: {} };
  conflitos = [];
}

function remocoes(): Chamada[] {
  return chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/campaign_group_remove_group_id");
}

test("POST com ficaEm que já não tem o grupo: 409 e nenhuma remoção", async () => {
  reiniciar();
  // Outra aba tirou o grupo de A; B ainda o tem. Tirar de B agora deixaria o grupo sem campanha.
  campanhas = [linha(A, "Verao", []), linha(B, "Moda Kids do Sul", [JID])];

  const res = await POST(pedir("POST", { jid: JID, ficaEm: A }));

  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: GRUPO_SAIU_DA_CAMPANHA });
  assert.equal(remocoes().length, 0);
});

test("POST bem-sucedido: uma remoção por campanha dona, nunca a escolhida, sempre com a loja", async () => {
  reiniciar();
  campanhas = [
    linha(A, "Verao", [JID, "outro@g.us"]),
    linha(B, "Moda Kids do Sul", [JID]),
    linha(C, "Inverno", ["x@g.us", JID]),
    linha(D, "Sem o grupo", ["y@g.us"]),
  ];

  const res = await POST(pedir("POST", { jid: JID, ficaEm: A }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const feitas = remocoes();
  assert.equal(feitas.length, 2);
  assert.deepEqual(feitas.map((c) => (c.corpo as { p_id: string }).p_id).sort(), [B, C]);
  for (const c of feitas) {
    assert.equal(c.metodo, "POST");
    assert.equal((c.corpo as { p_tenant_id: string }).p_tenant_id, LOJA);
    assert.equal((c.corpo as { p_whatsapp_group_id: string }).p_whatsapp_group_id, JID);
  }
  // A lista de onde planejar é lida só da loja do chamador.
  const [lista] = chamadas.filter((c) => c.url.pathname === "/rest/v1/campaign_groups");
  assert.equal(lista.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
});

test("POST: erro ao remover não vira { ok: true } — a rota responde 500", async () => {
  reiniciar();
  campanhas = [linha(A, "Verao", [JID]), linha(B, "Moda Kids do Sul", [JID])];
  remocao = { status: 500, corpo: { code: "XX000", details: null, hint: null, message: "banco fora do ar" } };
  const silencio = mock.method(console, "error", () => {});

  try {
    const res = await POST(pedir("POST", { jid: JID, ficaEm: A }));
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "Não deu pra salvar a escolha." });
  } finally {
    silencio.mock.restore();
  }
});

test("POST sem permissão de editar campanha é recusado com 403 e nada é lido nem removido", async () => {
  reiniciar();
  // `seller` é o único papel sem `campaign:edit`. Quem barra primeiro é o guard de módulo do
  // `getTenantContext` (esta rota não está no mapa da vendedora): `assertPermission` na rota é a
  // segunda trava e hoje nenhum papel real chega até ela, então este teste prova a recusa, não a trava.
  papel = "seller";
  campanhas = [linha(A, "Verao", [JID]), linha(B, "Moda Kids do Sul", [JID])];

  const res = await POST(pedir("POST", { jid: JID, ficaEm: A }));

  assert.equal(res.status, 403);
  assert.equal(remocoes().length, 0);
  assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/campaign_groups").length, 0);
});

test("GET devolve { conflitos } da RPC, com a loja no corpo", async () => {
  reiniciar();
  conflitos = [
    {
      whatsapp_group_id: JID,
      name: "Grupo VIP",
      campanhas: [
        { id: A, name: "Verao", slug: "verao", posicao: 2 },
        { id: B, name: "Moda Kids do Sul", slug: "moda-kids-do-sul", posicao: 1 },
      ],
    },
  ];

  const res = await GET(pedir("GET"));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    conflitos: [
      {
        whatsappGroupId: JID,
        nome: "Grupo VIP",
        campanhas: [
          { id: A, name: "Verao", slug: "verao", posicao: 2 },
          { id: B, name: "Moda Kids do Sul", slug: "moda-kids-do-sul", posicao: 1 },
        ],
      },
    ],
  });
  const [rpc] = chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/grupos_em_mais_de_uma_campanha");
  assert.deepEqual(rpc.corpo, { p_tenant: LOJA });
});
