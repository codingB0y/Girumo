import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyCustomDomain, type VerifyDeps } from "./verify";
import { VercelApiError, type ProjectDomain } from "./vercel";

const HOST = "links.sualoja.com.br";
const TOKEN = "tok123";
const VERIFICADO: ProjectDomain = { name: HOST, verified: true, verification: [] };

/** Dependências que levam até "ativo"; cada teste troca só o que quer quebrar. */
function deps(over: Partial<VerifyDeps> = {}): { log: string[]; deps: VerifyDeps } {
  const log: string[] = [];
  const base: VerifyDeps = {
    txtRecords: async (name) => {
      log.push(`txt:${name}`);
      return ["outra-coisa", `girumo-verify=${TOKEN}`];
    },
    getProjectDomain: async () => {
      log.push("get");
      return VERIFICADO;
    },
    addProjectDomain: async () => {
      log.push("add");
      return VERIFICADO;
    },
    verifyProjectDomain: async () => {
      log.push("verify");
      return VERIFICADO;
    },
    isDomainMisconfigured: async () => {
      log.push("config");
      return false;
    },
  };
  return { log, deps: { ...base, ...over } };
}

test("sem o TXT de posse não fala com a Vercel", async () => {
  const { log, deps: d } = deps({ txtRecords: async () => ["girumo-verify=de-outra-conta"] });
  assert.deepEqual(await verifyCustomDomain(HOST, TOKEN, d), { active: false, problem: "txt", challenges: [] });
  assert.deepEqual(log, []);
});

test("procura o TXT no nome _girumo-verify do host", async () => {
  const { log, deps: d } = deps();
  await verifyCustomDomain(HOST, TOKEN, d);
  assert.equal(log[0], `txt:_girumo-verify.${HOST}`);
});

test("domínio fora do projeto é adicionado; tudo certo vira ativo", async () => {
  const { log, deps: d } = deps({
    getProjectDomain: async () => null,
  });
  assert.deepEqual(await verifyCustomDomain(HOST, TOKEN, d), { active: true });
  assert.ok(log.includes("add"));
  assert.ok(log.includes("config"));
  assert.ok(!log.includes("verify"), "já veio verificado, não precisa do verify");
});

test("desafio da Vercel volta como registro para o lojista", async () => {
  const pendente: ProjectDomain = {
    name: HOST,
    verified: false,
    verification: [{ type: "TXT", domain: "_vercel.sualoja.com.br", value: "vc-domain-verify=x", reason: "r" }],
  };
  const { deps: d } = deps({
    getProjectDomain: async () => pendente,
    verifyProjectDomain: async () => pendente,
  });
  assert.deepEqual(await verifyCustomDomain(HOST, TOKEN, d), {
    active: false,
    problem: "vercel-verificacao",
    challenges: [{ tipo: "TXT", nome: "_vercel.sualoja.com.br", valor: "vc-domain-verify=x" }],
  });
});

test("CNAME ainda não chegou: pendente por dns", async () => {
  const { deps: d } = deps({ isDomainMisconfigured: async () => true });
  assert.deepEqual(await verifyCustomDomain(HOST, TOKEN, d), { active: false, problem: "dns", challenges: [] });
});

test("host preso a outro projeto Vercel (409): em-uso", async () => {
  const { deps: d } = deps({
    getProjectDomain: async () => null,
    addProjectDomain: async () => {
      throw new VercelApiError(409, "domain_already_in_use", "in use");
    },
  });
  assert.deepEqual(await verifyCustomDomain(HOST, TOKEN, d), { active: false, problem: "em-uso", challenges: [] });
});

test("falha inesperada da Vercel: vercel-erro", async (t) => {
  t.mock.method(console, "error", () => {});
  const { deps: d } = deps({
    getProjectDomain: async () => {
      throw new Error("rede caiu");
    },
  });
  assert.deepEqual(await verifyCustomDomain(HOST, TOKEN, d), { active: false, problem: "vercel-erro", challenges: [] });
});
