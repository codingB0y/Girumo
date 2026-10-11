import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { hashDaChave } from "@/lib/integracoes/chave-do-site";
import { POST } from "./route";

/**
 * A rota inteira contra um PostgREST de mentira, por "MÉTODO /caminho".
 * Chamada que ninguém previu vira 500, para aparecer.
 */

const CHAVE = `gk_live_${"A".repeat(43)}`;
const HASH = hashDaChave(CHAVE);
const CID = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";

type Chamada = { metodo: string; url: URL; corpo: unknown; accept: string };
type Resposta = { status: number; corpo?: unknown };
const chamadas: Chamada[] = [];
let tabelas: Record<string, (c: Chamada) => Resposta> = {};

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
      accept: String(req.headers.accept ?? ""),
    };
    chamadas.push(chamada);
    const responder = tabelas[`${chamada.metodo} ${chamada.url.pathname}`];
    const { status, corpo } = responder ? responder(chamada) : { status: 500, corpo: { message: `inesperado: ${chamada.metodo} ${chamada.url.pathname}` } };
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.HUBFLOW_USE_SUPABASE = "1";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.girumo.com.br";
});
after(() => { supabase.close(); });

const INTEGRACAO = { tenant_id: "loja-a", key_last4: "AAAA", tracked_link_id: "link-1", created_at: "t", rotated_at: null, last_used_at: null };
const LINK = { id: "link-1", tenant_id: "loja-a", slug: "vip-atacado", campaign_group_id: "camp-1", target_url: "x", clicks: 0, metadata: {}, created_at: "t", updated_at: "t" };
// `maybeSingle()` em GET pede array (o cliente tira a linha); vazio vira null.
const SEM_LINHA = { status: 200, corpo: [] };

/** Banco "feliz": chave válida, link existe, sem domínio próprio, cadastro novo. */
function bancoFeliz(extra: Record<string, (c: Chamada) => Resposta> = {}): void {
  tabelas = {
    "GET /rest/v1/site_integrations": (c) => ({ status: 200, corpo: c.url.searchParams.get("key_hash") === `eq.${HASH}` ? [INTEGRACAO] : [] }),
    "GET /rest/v1/tracked_links": () => ({ status: 200, corpo: [LINK] }),
    "POST /rest/v1/site_captures": () => ({ status: 201, corpo: { id: CID } }),
    "GET /rest/v1/custom_domains": () => SEM_LINHA,
    "PATCH /rest/v1/site_integrations": () => ({ status: 204 }),
    ...extra,
  };
}

const CORPO = {
  whatsapp: "62999998888",
  page_url: "https://modakidsdosul.com.br/vip?utm_source=ig&utm_campaign=C1&utm_term=S1&utm_content=A1",
  event_id: "3f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
};

function enviar(corpo: unknown, chave: string | null = CHAVE, ip = "203.0.113.7"): Request {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip, "user-agent": "Cloudflare-Workers" };
  if (chave) headers.authorization = `Bearer ${chave}`;
  return new Request("https://app.girumo.com.br/api/integracoes/cadastro", {
    method: "POST",
    headers,
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

test("cadastro novo: 201 com o link do app e o cid; grava a loja da CHAVE, nunca IP nem user-agent", async () => {
  chamadas.length = 0;
  bancoFeliz();
  const resposta = await POST(enviar(CORPO));
  assert.equal(resposta.status, 201);
  assert.deepEqual(await resposta.json(), {
    redirect: `https://app.girumo.com.br/r/vip-atacado?cid=${CID}`,
    capture_id: CID,
  });
  const [insert] = feitas("POST", "/rest/v1/site_captures");
  const gravado = insert.corpo as Record<string, unknown>;
  assert.equal(gravado.tenant_id, "loja-a");
  assert.equal(gravado.tracked_link_id, "link-1");
  assert.equal(gravado.whatsapp, "+5562999998888");
  assert.equal(gravado.utm_campaign, "C1");
  assert.ok(!JSON.stringify(gravado).includes("203.0.113.7"));
  assert.ok(!JSON.stringify(gravado).includes("Cloudflare-Workers"));
  const patches = feitas("PATCH", "/rest/v1/site_integrations");
  assert.equal(patches.length, 1);
  assert.equal(patches[0].url.searchParams.get("tenant_id"), "eq.loja-a");
});

test("mesmo event_id: 200 com o cadastro antigo e o link ATUAL da integração", async () => {
  chamadas.length = 0;
  bancoFeliz({
    "POST /rest/v1/site_captures": () => ({ status: 409, corpo: { code: "23505", message: "duplicate key", details: null, hint: null } }),
    "GET /rest/v1/site_captures": () => ({ status: 200, corpo: [{ id: "cad-antigo" }] }),
    "GET /rest/v1/tracked_links": () => ({ status: 200, corpo: [{ ...LINK, slug: "link-novo" }] }),
  });
  const resposta = await POST(enviar(CORPO));
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), {
    redirect: "https://app.girumo.com.br/r/link-novo?cid=cad-antigo",
    capture_id: "cad-antigo",
  });
});

test("domínio próprio ATIVO: link na raiz do domínio da loja; PENDENTE: host do app", async () => {
  const dominio = (status: string) => () => ({
    status: 200,
    corpo: [{ tenant_id: "loja-a", hostname: "links.modakidsdosul.com.br", verification_token: "t", status, last_error: null, checked_at: null, verified_at: null }],
  });
  bancoFeliz({ "GET /rest/v1/custom_domains": dominio("active") });
  const ativo = await (await POST(enviar(CORPO))).json();
  assert.equal(ativo.redirect, `https://links.modakidsdosul.com.br/vip-atacado?cid=${CID}`);

  bancoFeliz({ "GET /rest/v1/custom_domains": dominio("pending") });
  const pendente = await (await POST(enviar(CORPO))).json();
  assert.equal(pendente.redirect, `https://app.girumo.com.br/r/vip-atacado?cid=${CID}`);
});

test("sem chave, chave malformada ou desconhecida: 401 e nada gravado", async () => {
  chamadas.length = 0;
  bancoFeliz();
  assert.equal((await POST(enviar(CORPO, null))).status, 401);
  assert.equal((await POST(enviar(CORPO, "gk_test_xyz"))).status, 401);
  assert.equal(chamadas.length, 0, "formato errado não vai ao banco");
  assert.equal((await POST(enviar(CORPO, `gk_live_${"B".repeat(43)}`))).status, 401);
  assert.equal(feitas("POST", "/rest/v1/site_captures").length, 0);
});

test("número inválido: 422 'numero'; corpo inválido: 400; corpo grande: 413", async () => {
  bancoFeliz();
  const numero = await POST(enviar({ ...CORPO, whatsapp: "123" }));
  assert.equal(numero.status, 422);
  assert.deepEqual(await numero.json(), { error: "numero" });
  assert.equal((await POST(enviar({ ...CORPO, link: "vip-atacado" }))).status, 400);
  assert.equal((await POST(enviar("{não é json"))).status, 400);
  assert.equal((await POST(enviar({ ...CORPO, page_url: `https://x.test/?a=${"x".repeat(9000)}` }))).status, 413);
});

test("link da integração apagado: 409 'link' sem gravar cadastro", async () => {
  chamadas.length = 0;
  bancoFeliz({ "GET /rest/v1/tracked_links": () => ({ status: 200, corpo: [] }) });
  const resposta = await POST(enviar(CORPO));
  assert.equal(resposta.status, 409);
  assert.deepEqual(await resposta.json(), { error: "link" });
  assert.equal(feitas("POST", "/rest/v1/site_captures").length, 0);
});

test("erro do banco: 500 sem vazar a mensagem", async () => {
  bancoFeliz({ "POST /rest/v1/site_captures": () => ({ status: 500, corpo: { code: "XX000", message: "senha do banco: segredo", details: null, hint: null } }) });
  const resposta = await POST(enviar(CORPO));
  assert.equal(resposta.status, 500);
  assert.ok(!(await resposta.text()).includes("segredo"));
});

test("passou de 60 por minuto na mesma chave: 429", async () => {
  bancoFeliz({ "GET /rest/v1/site_integrations": () => ({ status: 200, corpo: [{ ...INTEGRACAO, tenant_id: "loja-teto" }] }) });
  let ultimo = 0;
  for (let i = 0; i < 61; i++) ultimo = (await POST(enviar({ ...CORPO, event_id: `evento-teto-${i}` }))).status;
  assert.equal(ultimo, 429);
});
