import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { MATRIZ_PADRAO, type RastreioConfig } from "@/lib/rastreio/tipos";
import {
  SlugEmUso,
  avancarCursor,
  garantirConfig,
  lerConfig,
  lojaPorSlug,
  lojasComRastreio,
  marcarImportado,
  rastreioLigado,
  salvarConfig,
} from "./rastreio-config";

/** O cliente real do Supabase contra um PostgREST de mentira (molde de `bling-pedidos.test.ts`). */

type Chamada = { metodo: string; url: URL; prefer: string; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500, corpo: { message: "sem resposta" } });

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      prefer: String(req.headers.prefer ?? ""),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
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

beforeEach(() => {
  chamadas.length = 0;
});

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([chave]) => chave !== "select"));

const LINHA = {
  tenant_id: "loja-a",
  public_slug: "moda-da-ana",
  matrix: MATRIZ_PADRAO,
  notify_store_on_problem: true,
  vip_link_id: null,
  store_whatsapp: null,
  imported_at: null,
  sweep_cursor: null,
};
const CONFIG: RastreioConfig = {
  tenantId: "loja-a",
  publicSlug: "moda-da-ana",
  matrix: MATRIZ_PADRAO,
  notifyStoreOnProblem: true,
  vipLinkId: null,
  storeWhatsapp: null,
  importedAt: null,
  sweepCursor: null,
};
const conflitoDe = (restricao: string): Resposta => ({
  status: 409,
  corpo: { code: "23505", message: `duplicate key value violates unique constraint "${restricao}"` },
});

test("rastreioLigado lê a flag da própria loja; sem linha é desligado", async () => {
  responder = () => ({ status: 200, corpo: [{ rastreio_enabled: true }] });
  assert.equal(await rastreioLigado("loja-a"), true);
  const [{ metodo, url }] = chamadas;
  assert.deepEqual([metodo, url.pathname, url.searchParams.get("select")], ["GET", "/rest/v1/tenant_settings", "rastreio_enabled"]);
  assert.deepEqual(filtros(url), { tenant_id: "eq.loja-a" });

  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await rastreioLigado("loja-a"), false);
});

test("lojasComRastreio é a única leitura sem loja", async () => {
  responder = () => ({ status: 200, corpo: [{ tenant_id: "loja-a" }, { tenant_id: "loja-b" }] });
  assert.deepEqual(await lojasComRastreio(), ["loja-a", "loja-b"]);
  assert.equal(chamadas[0].url.pathname, "/rest/v1/tenant_settings");
  assert.deepEqual(filtros(chamadas[0].url), { rastreio_enabled: "eq.true" });
});

test("lerConfig traduz a linha da loja", async () => {
  responder = () => ({ status: 200, corpo: [LINHA] });
  assert.deepEqual(await lerConfig("loja-a"), CONFIG);
  assert.equal(chamadas[0].url.pathname, "/rest/v1/tracking_settings");
  assert.deepEqual(filtros(chamadas[0].url), { tenant_id: "eq.loja-a" });

  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await lerConfig("loja-a"), null);
});

test("garantirConfig cria com o slug do nome e deixa o resto para o default do banco", async () => {
  responder = ({ metodo, url }) => {
    if (url.pathname === "/rest/v1/organizations") return { status: 200, corpo: [{ name: "Moda da Ana", niche: null }] };
    return metodo === "GET" ? { status: 200, corpo: [] } : { status: 201, corpo: [LINHA] };
  };
  assert.deepEqual(await garantirConfig("loja-a"), CONFIG);
  const org = chamadas.find((c) => c.url.pathname === "/rest/v1/organizations");
  assert.deepEqual(filtros(org!.url), { id: "eq.loja-a" });
  const posts = chamadas.filter((c) => c.metodo === "POST");
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].corpo, { tenant_id: "loja-a", public_slug: "moda-da-ana" });

  // Já existe: nenhum POST.
  chamadas.length = 0;
  responder = () => ({ status: 200, corpo: [LINHA] });
  assert.deepEqual(await garantirConfig("loja-a"), CONFIG);
  assert.equal(chamadas.filter((c) => c.metodo === "POST").length, 0);
});

test("garantirConfig: slug tomado vira -2, -3; corrida da loja relê; nome reservado vira loja", async () => {
  let posts = 0;
  responder = ({ metodo, url }) => {
    if (url.pathname === "/rest/v1/organizations") return { status: 200, corpo: [{ name: "Moda da Ana" }] };
    if (metodo === "GET") return { status: 200, corpo: [] };
    posts += 1;
    return posts <= 2 ? conflitoDe("tracking_settings_public_slug_key") : { status: 201, corpo: [{ ...LINHA, public_slug: "moda-da-ana-3" }] };
  };
  assert.equal((await garantirConfig("loja-a")).publicSlug, "moda-da-ana-3");
  assert.deepEqual(
    chamadas.filter((c) => c.metodo === "POST").map((c) => (c.corpo as { public_slug: string }).public_slug),
    ["moda-da-ana", "moda-da-ana-2", "moda-da-ana-3"],
  );

  // Corrida: outra requisição criou a config da loja entre a leitura e o insert.
  chamadas.length = 0;
  let leituras = 0;
  responder = ({ metodo, url }) => {
    if (url.pathname === "/rest/v1/organizations") return { status: 200, corpo: [{ name: "Moda da Ana" }] };
    if (metodo === "POST") return conflitoDe("tracking_settings_pkey");
    leituras += 1;
    return { status: 200, corpo: leituras === 1 ? [] : [LINHA] };
  };
  assert.deepEqual(await garantirConfig("loja-a"), CONFIG);

  // Nome com trecho reservado.
  chamadas.length = 0;
  responder = ({ metodo, url }) => {
    if (url.pathname === "/rest/v1/organizations") return { status: 200, corpo: [{ name: "Girumo Oficial" }] };
    return metodo === "GET" ? { status: 200, corpo: [] } : { status: 201, corpo: [{ ...LINHA, public_slug: "loja" }] };
  };
  await garantirConfig("loja-a");
  assert.deepEqual(chamadas.find((c) => c.metodo === "POST")!.corpo, { tenant_id: "loja-a", public_slug: "loja" });
});

test("garantirConfig: sem endereço livre depois de 10 candidatos é erro", async () => {
  responder = ({ metodo, url }) => {
    if (url.pathname === "/rest/v1/organizations") return { status: 200, corpo: [{ name: "Moda da Ana" }] };
    return metodo === "GET" ? { status: 200, corpo: [] } : conflitoDe("tracking_settings_public_slug_key");
  };
  await assert.rejects(garantirConfig("loja-a"), /sem endereço livre/);
  assert.equal(chamadas.filter((c) => c.metodo === "POST").length, 10);
});

test("salvarConfig grava só o que veio, na própria loja; slug de outra loja é SlugEmUso", async () => {
  responder = () => ({ status: 200, corpo: [{ ...LINHA, public_slug: "nova" }] });
  assert.equal((await salvarConfig("loja-a", { publicSlug: "nova" })).publicSlug, "nova");
  const [{ metodo, url, corpo }] = chamadas;
  assert.deepEqual([metodo, url.pathname], ["PATCH", "/rest/v1/tracking_settings"]);
  assert.deepEqual(filtros(url), { tenant_id: "eq.loja-a" });
  const { updated_at: carimbo, ...resto } = corpo as Record<string, string>;
  assert.deepEqual(resto, { public_slug: "nova" });
  assert.match(carimbo, ISO);

  responder = () => conflitoDe("tracking_settings_public_slug_key");
  await assert.rejects(salvarConfig("loja-a", { publicSlug: "tomada" }), SlugEmUso);

  responder = () => ({ status: 200, corpo: [] });
  await assert.rejects(salvarConfig("loja-a", { notifyStoreOnProblem: false }), /configuração não encontrada/);
});

test("lojaPorSlug só devolve loja com o Rastreio ligado", async () => {
  responder = ({ url }) =>
    url.pathname === "/rest/v1/tracking_settings" ? { status: 200, corpo: [LINHA] } : { status: 200, corpo: [{ rastreio_enabled: true }] };
  assert.deepEqual(await lojaPorSlug("moda-da-ana"), CONFIG);
  assert.deepEqual(filtros(chamadas[0].url), { public_slug: "eq.moda-da-ana" });
  assert.equal(chamadas[1].url.pathname, "/rest/v1/tenant_settings");
  assert.deepEqual(filtros(chamadas[1].url), { tenant_id: "eq.loja-a" });

  responder = ({ url }) =>
    url.pathname === "/rest/v1/tracking_settings" ? { status: 200, corpo: [LINHA] } : { status: 200, corpo: [{ rastreio_enabled: false }] };
  assert.equal(await lojaPorSlug("moda-da-ana"), null);

  chamadas.length = 0;
  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await lojaPorSlug("nao-existe"), null);
  assert.equal(chamadas.length, 1);
});

test("marcarImportado e avancarCursor gravam na própria loja e falham sem linha", async () => {
  responder = () => ({ status: 200, corpo: [{ tenant_id: "loja-a" }] });
  await marcarImportado("loja-a", new Date("2026-10-29T15:00:00.000Z"));
  await avancarCursor("loja-a", "2026-10-29T14:00:00.000Z");
  assert.deepEqual(
    chamadas.map((c) => [c.metodo, c.url.pathname, filtros(c.url)]),
    [
      ["PATCH", "/rest/v1/tracking_settings", { tenant_id: "eq.loja-a" }],
      ["PATCH", "/rest/v1/tracking_settings", { tenant_id: "eq.loja-a" }],
    ],
  );
  assert.deepEqual(chamadas[0].corpo, { imported_at: "2026-10-29T15:00:00.000Z" });
  assert.deepEqual(chamadas[1].corpo, { sweep_cursor: "2026-10-29T14:00:00.000Z" });

  responder = () => ({ status: 200, corpo: [] });
  await assert.rejects(marcarImportado("loja-a", new Date()), /configuração não encontrada/);
  await assert.rejects(avancarCursor("loja-a", "x"), /configuração não encontrada/);
});
