import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

/**
 * O que o motor tira do ambiente: se a integração está disponível (as credenciais do app E a chave
 * dos tokens) e o limite global de /oauth/token, que com o Upstash configurado e fora do ar cai num
 * balde em memória de 1 por minuto por instância: o teto normal deixaria passar N× 10 (20 chamadas em
 * 60 s bloqueiam o IP no Bling por 60 min, para todas as lojas), e bloquear tudo pararia toda loja
 * cujo token vence.
 */

// Um Upstash que só devolve erro. O módulo lê o ambiente ao carregar: configurado antes do import.
const upstash = createServer((_req, res) => {
  res.statusCode = 500;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "ERR fora do ar" }));
});

let deps: typeof import("./deps");

before(async () => {
  await new Promise<void>((pronto) => upstash.listen(0, "127.0.0.1", pronto));
  const { port } = upstash.address() as AddressInfo;
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${port}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = "token-do-upstash-falso";
  deps = await import("./deps");
});
after(() => {
  upstash.close();
});

const CHAVE_VALIDA = Buffer.alloc(32, 7).toString("base64");

function env(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...vars, NODE_ENV: "test" };
}

test("disponível só com as credenciais do app E a chave dos tokens", () => {
  const app = { BLING_CLIENT_ID: "app", BLING_CLIENT_SECRET: "segredo" };
  assert.equal(deps.blingDisponivel(env({})), false);
  assert.equal(deps.blingDisponivel(env(app)), false);
  assert.equal(deps.blingDisponivel(env({ ...app, INTEGRATIONS_ENCRYPTION_KEY: "curta" })), false);
  assert.equal(deps.blingDisponivel(env({ ...app, INTEGRATIONS_ENCRYPTION_KEY: CHAVE_VALIDA })), true);
  assert.equal(deps.blingDisponivel(env({ BLING_CLIENT_ID: "app", INTEGRATIONS_ENCRYPTION_KEY: CHAVE_VALIDA })), false);
});

test("limite global de /oauth/token com o Upstash fora do ar: 1 por minuto por instância, nem o teto normal nem zero", async (t) => {
  t.mock.method(console, "error", () => undefined);
  const { limiteTokenGlobal } = deps.depsDeProducao();
  // Mutante (falha fechado, a prova R2-T1): toda renovação barrada, e a loja parava quando o token vencia.
  assert.equal(await limiteTokenGlobal(), false);
  // Mutante (o balde normal): cada instância contaria as suas 10 chamadas por minuto.
  assert.equal(await limiteTokenGlobal(), true);
});
