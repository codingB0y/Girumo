import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { POST as RotaPost } from "./route";

/**
 * POST /api/relampago/offers contra um PostgREST e uma Evolution de mentira num servidor só
 * (desenho de `lib/groups/sincronizar.test.ts` e de `api/campanhas/route.test.ts`). O que sai
 * daqui é o que sai em produção; só a rede é trocada.
 */

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const LOJA = "loja-a";
const JID = "120363001@g.us";
const chamadas: Chamada[] = [];

const GRUPOS = {
  id: "inst-g",
  tenant_id: LOJA,
  name: "Número dos grupos",
  phone: "5511900000001",
  purpose: "grupos",
  status: "connected",
  qr_code: null,
  provider: "evolution",
  provider_instance_id: "gr_inst-g",
  last_seen_at: null,
  connected_at: null,
  metadata: {},
  created_at: "2026-09-01T00:00:00+00:00",
  updated_at: "2026-09-01T00:00:00+00:00",
};
const ATENDIMENTO = { ...GRUPOS, id: "inst-p", name: "Atendimento", phone: "5511900000002", purpose: "privado", provider_instance_id: "gr_inst-p" };

/** Quem está no grupo: o `@lid` só vira telefone se este número ler os participantes. */
const DA_EVOLUTION = [{ id: JID, subject: "Moda Kids 1", participants: [{ id: "111@lid", phoneNumber: "5511900000003@s.whatsapp.net" }] }];

const banco: Record<string, (c: Chamada) => Resposta> = {
  "GET /auth/v1/user": () => ({ status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } }),
  "GET /rest/v1/memberships": () => ({ status: 200, corpo: [{ tenant_id: LOJA, role: "owner", modules: [] }] }),
  // O atendimento vem PRIMEIRO: sem o filtro `purpose=eq.grupos`, é ele o "conectado" escolhido.
  "GET /rest/v1/instances": (c) => ({
    status: 200,
    corpo: [ATENDIMENTO, GRUPOS].filter((linha) => {
      const filtro = c.url.searchParams.get("purpose");
      return filtro === null || filtro === `eq.${linha.purpose}`;
    }),
  }),
  "GET /rest/v1/groups": () => ({ status: 200, corpo: [{ id: "row-1", whatsapp_group_id: JID }] }),
  "POST /rest/v1/flash_offers": () => ({ status: 201, corpo: { id: "oferta-1" } }),
  "GET /rest/v1/engine_events": () => ({ status: 200, corpo: [] }),
  "POST /rest/v1/flash_offer_groups": () => ({ status: 201 }),
  "GET /group/fetchAllGroups/gr_inst-g": () => ({ status: 200, corpo: DA_EVOLUTION }),
};

const servidor = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte.toString("utf8")));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    // Chamada que ninguém previu vira 500, para aparecer.
    const { status, corpo } = banco[`${chamada.metodo} ${chamada.url.pathname}`]?.(chamada) ?? {
      status: 500,
      corpo: { message: `inesperado: ${chamada.metodo} ${chamada.url.pathname}` },
    };
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

let POST: typeof RotaPost;

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const { port } = servidor.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  // O env aponta para o falso antes de a rota carregar.
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.EVOLUTION_API_URL = base;
  process.env.EVOLUTION_API_KEY = "chave-da-evolution-falsa";
  ({ POST } = await import("./route"));
});

after(() => {
  servidor.close();
});

const feitas = (metodo: string, caminho: string) =>
  chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);

test("abrir a oferta lê os participantes pelo número dos grupos, nunca pelo do atendimento", async () => {
  chamadas.length = 0;

  const res = await POST(
    new Request("http://girumo.test/api/relampago/offers", {
      method: "POST",
      headers: { authorization: "Bearer token-falso", "x-tenant-id": LOJA, "content-type": "application/json" },
      body: JSON.stringify({ name: "Vestido floral", slots: 5, groupIds: [JID] }),
    }),
  );

  assert.equal(res.status, 201);

  // Mutante: listInstances no lugar de listGroupInstances — o atendimento vem primeiro e lê os grupos.
  assert.equal(feitas("GET", "/group/fetchAllGroups/gr_inst-p").length, 0);
  assert.equal(feitas("GET", "/group/fetchAllGroups/gr_inst-g").length, 1);
  const [leitura, ...outras] = feitas("GET", "/rest/v1/instances");
  assert.equal(outras.length, 0);
  assert.equal(leitura.url.searchParams.get("purpose"), "eq.grupos");
  assert.equal(leitura.url.searchParams.get("tenant_id"), `eq.${LOJA}`);

  // O mapa @lid -> telefone veio do número dos grupos e foi para a janela do grupo.
  const [janela] = feitas("POST", "/rest/v1/flash_offer_groups");
  assert.deepEqual(
    (janela.corpo as Array<Record<string, unknown>>).map((l) => [l.tenant_id, l.offer_id, l.whatsapp_group_id, l.lid_map]),
    [[LOJA, "oferta-1", JID, { "111@lid": "5511900000003" }]],
  );
});
