import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  VercelApiError,
  addProjectDomain,
  getProjectDomain,
  isDomainMisconfigured,
  removeProjectDomain,
  vercelConfigured,
  verifyProjectDomain,
} from "./vercel";

type Chamada = { method: string; url: URL; auth: string | null; body: unknown };
let chamadas: Chamada[] = [];
let respostas: Response[] = [];
const fetchOriginal = globalThis.fetch;

const PROJETO = "prj_OqpJ680p1Q5LWE2cGjiOg1cnuJPq";
const TIME = "team_2H4HYmKVySM4jMf2MCOAdm3E";
const HOST = "links.loja.com.br";

beforeEach(() => {
  chamadas = [];
  respostas = [];
  process.env.VERCEL_API_TOKEN = "token-de-teste";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push({
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      auth: new Headers(init?.headers).get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const proxima = respostas.shift();
    if (!proxima) throw new Error("fetch sem resposta preparada");
    return proxima;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.VERCEL_API_TOKEN;
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("sem token a integração fica desligada e não chama a API", async () => {
  delete process.env.VERCEL_API_TOKEN;
  assert.equal(vercelConfigured(), false);
  await assert.rejects(getProjectDomain(HOST), (e: unknown) => e instanceof VercelApiError && e.code === "not_configured");
  assert.equal(chamadas.length, 0);
});

test("lê o domínio do projeto com token e time; 404 vira null", async () => {
  respostas.push(json(404, { error: { code: "not_found", message: "x" } }));
  assert.equal(await getProjectDomain(HOST), null);
  const [c] = chamadas;
  assert.equal(c.method, "GET");
  assert.equal(c.url.pathname, `/v9/projects/${PROJETO}/domains/${HOST}`);
  assert.equal(c.url.searchParams.get("teamId"), TIME);
  assert.equal(c.auth, "Bearer token-de-teste");
});

test("adiciona o domínio ao projeto e devolve o estado de verificação", async () => {
  const desafio = { type: "TXT", domain: "_vercel.loja.com.br", value: "vc-domain-verify=abc", reason: "pending_domain_verification" };
  respostas.push(json(200, { name: HOST, verified: false, verification: [desafio], apexName: "loja.com.br", projectId: PROJETO }));
  assert.deepEqual(await addProjectDomain(HOST), { name: HOST, verified: false, verification: [desafio] });
  assert.equal(chamadas[0].method, "POST");
  assert.equal(chamadas[0].url.pathname, `/v10/projects/${PROJETO}/domains`);
  assert.deepEqual(chamadas[0].body, { name: HOST });
});

test("409 da Vercel vira VercelApiError com status e código", async () => {
  respostas.push(json(409, { error: { code: "domain_already_in_use", message: "in use" } }));
  await assert.rejects(
    addProjectDomain(HOST),
    (e: unknown) => e instanceof VercelApiError && e.status === 409 && e.code === "domain_already_in_use",
  );
});

test("verify com desafio pendente (400) devolve o estado lido de novo", async () => {
  respostas.push(json(400, { error: { code: "missing_txt_record", message: "x" } }));
  respostas.push(json(200, { name: HOST, verified: false, verification: [{ type: "TXT", domain: "_vercel.loja.com.br", value: "v", reason: "r" }] }));
  const d = await verifyProjectDomain(HOST);
  assert.equal(d.verified, false);
  assert.equal(d.verification.length, 1);
  assert.equal(chamadas[0].method, "POST");
  assert.equal(chamadas[0].url.pathname, `/v9/projects/${PROJETO}/domains/${HOST}/verify`);
});

test("verify bem-sucedido devolve verificado", async () => {
  respostas.push(json(200, { name: HOST, verified: true }));
  assert.deepEqual(await verifyProjectDomain(HOST), { name: HOST, verified: true, verification: [] });
});

test("configuração: misconfigured da Vercel, com o projeto e o time na query", async () => {
  respostas.push(json(200, { misconfigured: true, configuredBy: null }));
  respostas.push(json(200, { misconfigured: false, configuredBy: "CNAME" }));
  assert.equal(await isDomainMisconfigured(HOST), true);
  assert.equal(await isDomainMisconfigured(HOST), false);
  assert.equal(chamadas[0].url.pathname, `/v6/domains/${HOST}/config`);
  assert.equal(chamadas[0].url.searchParams.get("projectIdOrName"), PROJETO);
  assert.equal(chamadas[0].url.searchParams.get("teamId"), TIME);
});

test("remover domínio que já não está no projeto é sucesso", async () => {
  respostas.push(json(404, { error: { code: "not_found", message: "x" } }));
  await removeProjectDomain(HOST);
  assert.equal(chamadas[0].method, "DELETE");
  assert.equal(chamadas[0].url.pathname, `/v9/projects/${PROJETO}/domains/${HOST}`);
});

test("falha inesperada ao remover sobe como erro", async () => {
  respostas.push(json(500, { error: { code: "internal", message: "boom" } }));
  await assert.rejects(removeProjectDomain(HOST), (e: unknown) => e instanceof VercelApiError && e.status === 500);
});
