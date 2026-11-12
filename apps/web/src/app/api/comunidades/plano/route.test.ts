import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { RespostaDoPlano } from "@/lib/communities/plano";
import type { POST as RotaPost } from "./route";

/**
 * POST /api/comunidades/plano contra um Supabase de mentira (desenho de
 * `comunidades/[slug]/grupos/route.test.ts`). O que importa aqui é quem vira candidato, o que entra
 * por padrão e que as duas leituras vão filtradas pela loja: o service-role não passa por RLS.
 */

type Chamada = { metodo: string; url: URL };
const chamadas: Chamada[] = [];

const AGORA = "2026-11-12T12:00:00.000Z";

const GRUPOS = [
  { id: "1", whatsapp_group_id: "grande@g.us", name: "Atacado 1", members: 874, is_admin: true, community_jid: null, community_role: null },
  { id: "2", whatsapp_group_id: "pequeno@g.us", name: "Atacado 2", members: 120, is_admin: true, community_jid: null, community_role: null },
  { id: "3", whatsapp_group_id: "interno@g.us", name: "Entregas", members: 3, is_admin: true, community_jid: null, community_role: null },
  { id: "4", whatsapp_group_id: "sem-admin@g.us", name: "Sem admin", members: 400, is_admin: false, community_jid: null, community_role: null },
  { id: "5", whatsapp_group_id: "vinculado@g.us", name: "Já vinculado", members: 300, is_admin: true, community_jid: "c@g.us", community_role: "member" },
  { id: "6", whatsapp_group_id: "c@g.us", name: "Comunidade", members: 1, is_admin: true, community_jid: "c@g.us", community_role: "parent" },
];

const PARTICIPANTES = [
  { whatsapp_group_id: "grande@g.us", participant_lid: "p1@lid", phone: null, last_seen_at: AGORA },
  { whatsapp_group_id: "pequeno@g.us", participant_lid: "p1@lid", phone: null, last_seen_at: AGORA },
];

const supabase = createServer((req, res) => {
  const chamada: Chamada = { metodo: req.method ?? "", url: new URL(req.url ?? "/", "http://supabase.falso") };
  chamadas.push(chamada);
  const { pathname } = chamada.url;
  let corpo: unknown = { message: `inesperado: ${chamada.metodo} ${pathname}` };
  let status = 500;
  if (pathname === "/auth/v1/user") [status, corpo] = [200, { id: "usuario-1", email: "dono@loja.test" }];
  if (pathname === "/rest/v1/memberships") [status, corpo] = [200, [{ tenant_id: "loja-a", role: "owner", modules: [] }]];
  if (pathname === "/rest/v1/groups") [status, corpo] = [200, GRUPOS];
  if (pathname === "/rest/v1/group_participants") [status, corpo] = [200, PARTICIPANTES];
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(corpo));
});

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

function pedir(corpo?: unknown): Promise<Response> {
  return POST(
    new Request("http://girumo.test/api/comunidades/plano", {
      method: "POST",
      headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-a", "content-type": "application/json" },
      body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    }),
  );
}

test("sem escolha: candidato é grupo admin fora de comunidade, e o interno fica de fora", async () => {
  chamadas.length = 0;

  const res = await pedir();

  assert.equal(res.status, 200);
  const { candidatos, plano } = (await res.json()) as RespostaDoPlano;
  assert.deepEqual(
    candidatos.map((c) => [c.whatsappGroupId, c.incluido, c.interno, c.grande]),
    [
      ["grande@g.us", true, false, true],
      ["pequeno@g.us", true, false, false],
      ["interno@g.us", false, true, false],
    ],
  );
  assert.equal(plano.comunidades.length, 1);
  assert.equal(plano.comunidades[0].pessoasHoje, 874 + 120 - 1, "p1 está nos dois e conta uma vez");
  assert.equal(plano.pessoasEstimadas, false);

  // As duas leituras saem filtradas pela loja.
  for (const tabela of ["/rest/v1/groups", "/rest/v1/group_participants"]) {
    const leitura = chamadas.find((c) => c.url.pathname === tabela);
    assert.ok(leitura, `não leu ${tabela}`);
    assert.equal(leitura.url.searchParams.get("tenant_id"), "eq.loja-a", `${tabela} sem filtro de loja`);
  }
});

test("com escolha: entra o interno pedido, e id que não é candidato desta loja é ignorado", async () => {
  const res = await pedir({ incluir: ["interno@g.us", "pequeno@g.us", "sem-admin@g.us", "de-outra-loja@g.us"] });

  assert.equal(res.status, 200);
  const { candidatos, plano } = (await res.json()) as RespostaDoPlano;
  assert.deepEqual(
    candidatos.filter((c) => c.incluido).map((c) => c.whatsappGroupId),
    ["pequeno@g.us", "interno@g.us"],
  );
  assert.deepEqual(
    plano.comunidades.flatMap((c) => c.grupos.map((g) => g.whatsappGroupId)),
    ["pequeno@g.us", "interno@g.us"],
  );
});

test("escolha vazia: nenhum grupo no plano e nenhuma leitura de participantes", async () => {
  chamadas.length = 0;

  const res = await pedir({ incluir: [] });

  assert.equal(res.status, 200);
  const { plano } = (await res.json()) as RespostaDoPlano;
  assert.equal(plano.comunidades.length, 0);
  assert.equal(
    chamadas.some((c) => c.url.pathname === "/rest/v1/group_participants"),
    false,
  );
});

test("corpo que não é lista de ids: 400", async () => {
  for (const corpo of ["{nao-e-json", { incluir: "grande@g.us" }, { incluir: [1, 2] }, []]) {
    const res = await pedir(corpo);
    assert.equal(res.status, 400, `aceitou ${JSON.stringify(corpo)}`);
  }
});
