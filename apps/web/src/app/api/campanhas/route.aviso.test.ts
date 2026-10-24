import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { PATCH as RotaPatch } from "./route";

/**
 * O PATCH de campanha contra um Supabase de mentira (mesmo desenho de `route.grow-template.test.ts`):
 * só a rede é trocada. Aqui o foco é o `avisoAoLotar` (spec 2026-10-10 D10): a rota lê a campanha
 * da loja e `proximoAviso` decide o `desde` — ligar grava `agora`, trocar o texto mantém o do banco,
 * esvaziar zera os dois.
 */

const CAMPANHA_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const DESDE_ANTIGO = "2026-10-01T12:00:00.000Z";

type Chamada = { metodo: string; url: URL; corpo: unknown };

const chamadas: Chamada[] = [];

const BASE = {
  id: CAMPANHA_ID,
  tenant_id: "loja-b",
  name: "Moda Kids do Sul",
  slug: "moda-kids",
  group_ids: ["g1@g.us"],
  auto_grow: false,
  grow_template: null as Record<string, unknown> | null,
  metadata: {},
  whatsapp_community_jid: null,
  aviso_ao_lotar: null as string | null,
  aviso_ao_lotar_desde: null as string | null,
  created_at: "2026-09-01T00:00:00+00:00",
  updated_at: "2026-09-01T00:00:00+00:00",
};

/** O que o banco "tem" no momento; cada teste ajusta antes de chamar a rota. */
let noBanco: typeof BASE | null = { ...BASE };

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
      corpo = chamada.metodo === "GET" ? (noBanco ? [noBanco] : []) : [{ ...noBanco, ...(chamada.corpo as Record<string, unknown>) }];
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

function gravado(): Record<string, unknown> | undefined {
  return feitas("PATCH", "/rest/v1/campaign_groups")[0]?.corpo as Record<string, unknown> | undefined;
}

function preparar(banco: Partial<typeof BASE>): void {
  chamadas.length = 0;
  noBanco = { ...BASE, ...banco };
}

test("desligado → texto liga o aviso com desde = agora, e a loja filtra leitura e escrita", async () => {
  preparar({});
  const antes = Date.now();

  const res = await PATCH(patchDoDono({ id: CAMPANHA_ID, avisoAoLotar: "  Lotou! Entre no próximo.  " }));

  assert.equal(res.status, 200);
  const g = gravado();
  assert.ok(g, "a campanha não foi gravada");
  assert.equal(g.aviso_ao_lotar, "Lotou! Entre no próximo.");
  const desde = Date.parse(String(g.aviso_ao_lotar_desde));
  assert.ok(desde >= antes && desde <= Date.now(), "desde deve ser o instante do PATCH");
  const [busca] = feitas("GET", "/rest/v1/campaign_groups");
  assert.ok(busca, "a campanha atual não foi lida");
  assert.equal(busca.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(busca.url.searchParams.get("id"), `eq.${CAMPANHA_ID}`);
  assert.equal(feitas("PATCH", "/rest/v1/campaign_groups")[0]?.url.searchParams.get("tenant_id"), "eq.loja-b");
  const json = (await res.json()) as { avisoAoLotar: string | null; avisoAoLotarDesde: string | null };
  assert.equal(json.avisoAoLotar, "Lotou! Entre no próximo.");
  assert.equal(json.avisoAoLotarDesde, g.aviso_ao_lotar_desde);
});

test("texto → outro texto mantém o desde que está no banco", async () => {
  preparar({ aviso_ao_lotar: "Texto velho", aviso_ao_lotar_desde: DESDE_ANTIGO });

  const res = await PATCH(patchDoDono({ id: CAMPANHA_ID, avisoAoLotar: "Texto novo" }));

  assert.equal(res.status, 200);
  const g = gravado();
  assert.equal(g?.aviso_ao_lotar, "Texto novo");
  assert.equal(g?.aviso_ao_lotar_desde, DESDE_ANTIGO);
});

test("só espaços desliga: grava os dois campos nulos", async () => {
  preparar({ aviso_ao_lotar: "Texto velho", aviso_ao_lotar_desde: DESDE_ANTIGO });

  const res = await PATCH(patchDoDono({ id: CAMPANHA_ID, avisoAoLotar: "   " }));

  assert.equal(res.status, 200);
  const g = gravado();
  assert.ok(g && "aviso_ao_lotar" in g && "aviso_ao_lotar_desde" in g, "os dois campos precisam ir no PATCH");
  assert.equal(g.aviso_ao_lotar, null);
  assert.equal(g.aviso_ao_lotar_desde, null);
});

for (const [rotulo, valor] of [
  ["número", 42],
  ["nulo", null],
  ["mais de 1000 caracteres depois do trim", `  ${"a".repeat(1001)}  `],
] as const) {
  test(`avisoAoLotar inválido (${rotulo}) dá 400 sem gravar nada`, async () => {
    preparar({ aviso_ao_lotar: "Texto velho", aviso_ao_lotar_desde: DESDE_ANTIGO });

    const res = await PATCH(patchDoDono({ id: CAMPANHA_ID, avisoAoLotar: valor }));

    assert.equal(res.status, 400);
    assert.equal(typeof ((await res.json()) as { error?: unknown }).error, "string");
    assert.equal(feitas("PATCH", "/rest/v1/campaign_groups").length, 0, "nada pode ser gravado");
  });
}

test("1000 caracteres exatos depois do trim passa", async () => {
  preparar({});

  const res = await PATCH(patchDoDono({ id: CAMPANHA_ID, avisoAoLotar: ` ${"a".repeat(1000)} ` }));

  assert.equal(res.status, 200);
  assert.equal((gravado()?.aviso_ao_lotar as string).length, 1000);
});

test("campanha de outra loja (não achada) dá 404 e não grava", async () => {
  preparar({});
  noBanco = null; // o PostgREST falso responde lista vazia: a loja não tem essa campanha
  const res = await PATCH(patchDoDono({ id: CAMPANHA_ID, avisoAoLotar: "Oi" }));

  assert.equal(res.status, 404);
  assert.equal(feitas("PATCH", "/rest/v1/campaign_groups").length, 0);
});

test("avisoAoLotar junto com growTemplate faz uma leitura só e mantém o merge do template", async () => {
  preparar({ grow_template: { subjectPattern: "Velho {n}", padronizadoEm: "2026-10-10T12:00:00.000Z" } });

  const res = await PATCH(
    patchDoDono({ id: CAMPANHA_ID, avisoAoLotar: "Oi", growTemplate: { subjectPattern: "Novo {n}" } }),
  );

  assert.equal(res.status, 200);
  assert.equal(feitas("GET", "/rest/v1/campaign_groups").length, 1, "a campanha atual deve ser lida uma vez");
  assert.deepEqual(gravado()?.grow_template, { subjectPattern: "Novo {n}", padronizadoEm: "2026-10-10T12:00:00.000Z" });
  assert.equal(gravado()?.aviso_ao_lotar, "Oi");
});
