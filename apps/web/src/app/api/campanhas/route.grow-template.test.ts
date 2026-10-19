import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { PATCH as RotaPatch } from "./route";

/**
 * O PATCH de campanha contra um Supabase de mentira (mesmo desenho de `route.test.ts`): só a rede
 * é trocada. Aqui o foco é o `growTemplate`, que tem de ser MESCLADO com o que está no banco —
 * o painel manda só `subjectPattern` a cada salvar, e o `padronizadoEm` do Padronizar precisa
 * sobreviver (é ele que faz o auto-grow nomear o próximo grupo pela sequência nova).
 */

const CAMPANHA_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";

type Chamada = { metodo: string; url: URL; corpo: unknown };

const chamadas: Chamada[] = [];

const NO_BANCO = {
  id: CAMPANHA_ID,
  tenant_id: "loja-b",
  name: "Moda Kids do Sul",
  slug: "moda-kids",
  group_ids: ["g1@g.us"],
  auto_grow: true,
  grow_template: {
    subjectPattern: "Moda Kids do Sul {n}",
    desc: "Bazar",
    mediaId: "m1",
    padronizadoEm: "2026-10-10T12:00:00.000Z",
  },
  metadata: {},
  whatsapp_community_jid: null,
  created_at: "2026-09-01T00:00:00+00:00",
  updated_at: "2026-09-01T00:00:00+00:00",
};

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
    const { pathname } = chamada.url;
    let corpo: unknown = { message: `inesperado: ${chamada.metodo} ${pathname}` };
    let status = 500;
    if (pathname === "/auth/v1/user") {
      status = 200;
      corpo = { id: "usuario-1", email: "dono@loja.test" };
    } else if (pathname === "/rest/v1/memberships") {
      status = 200;
      corpo = [{ tenant_id: "loja-b", role: "owner", modules: [] }];
    } else if (pathname === "/rest/v1/campaign_groups") {
      status = 200;
      corpo = chamada.metodo === "GET" ? [NO_BANCO] : [{ ...NO_BANCO, ...(chamada.corpo as Record<string, unknown>) }];
    }
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(corpo));
  });
});

let PATCH: typeof RotaPatch;

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  // `USE_SUPABASE` é lido no import da rota: sem isto cairia no ramo JSON legado.
  process.env.HUBFLOW_USE_SUPABASE = "1";
  ({ PATCH } = await import("./route"));
});

after(() => {
  supabase.close();
});

function patchDoDono(corpo: unknown): Request {
  return new Request("http://girumo.test/api/campanhas", {
    method: "PATCH",
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

test("PATCH com growTemplate mantém a identidade e o padronizadoEm que estão no banco", async () => {
  chamadas.length = 0;

  // O que o campaign-config manda a cada salvar. Mutante: o
  // `patch.grow_template = b.growTemplate` antigo, que trocava o objeto inteiro.
  const res = await PATCH(
    patchDoDono({ id: CAMPANHA_ID, autoGrow: true, groupIds: ["g1@g.us"], growTemplate: { subjectPattern: "Ofertas {n}" } }),
  );

  assert.equal(res.status, 200);
  const [gravado] = feitas("PATCH", "/rest/v1/campaign_groups");
  assert.ok(gravado, "a campanha não foi gravada");
  assert.equal(gravado.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.deepEqual((gravado.corpo as { grow_template?: unknown }).grow_template, {
    subjectPattern: "Ofertas {n}",
    desc: "Bazar",
    mediaId: "m1",
    padronizadoEm: "2026-10-10T12:00:00.000Z",
  });
});

test("PATCH só com growTemplate busca a campanha da loja para mesclar", async () => {
  chamadas.length = 0;

  const res = await PATCH(patchDoDono({ id: CAMPANHA_ID, growTemplate: { subjectPattern: "Ofertas {n}" } }));

  assert.equal(res.status, 200);
  const [busca] = feitas("GET", "/rest/v1/campaign_groups");
  assert.ok(busca, "a campanha atual não foi lida");
  assert.equal(busca.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(busca.url.searchParams.get("id"), `eq.${CAMPANHA_ID}`);
  const [gravado] = feitas("PATCH", "/rest/v1/campaign_groups");
  assert.equal(
    (gravado?.corpo as { grow_template?: { padronizadoEm?: string } } | undefined)?.grow_template?.padronizadoEm,
    "2026-10-10T12:00:00.000Z",
  );
});
