import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { POST } from "./route";

/**
 * Login contra um Auth falso. O que se prova aqui é a mensagem: antes, toda
 * falha do `signInWithPassword` — inclusive o teto de tentativas do Supabase,
 * que é por IP e o lojista não controla — virava "E-mail ou senha incorretos".
 */

let falha: { status: number; code: string } = { status: 400, code: "invalid_credentials" };

const supabase = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = falha.status;
    res.end(JSON.stringify({ code: falha.status, error_code: falha.code, msg: `falha ${falha.code}` }));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-do-falso";
  process.env.SUPABASE_ANON_KEY = "anon-do-falso";
});
after(() => {
  supabase.close();
});
beforeEach(() => {
  falha = { status: 400, code: "invalid_credentials" };
});

function entrar(): Promise<Response> {
  return POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "dono@loja.test", password: "qualquer-uma" }),
    }),
  );
}

test("credencial errada: 401 'E-mail ou senha incorretos.'", async () => {
  const res = await entrar();
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "E-mail ou senha incorretos." });
});

test("limite de tentativas do Supabase: 429 pedindo para esperar, não 'senha incorreta'", async () => {
  falha = { status: 429, code: "over_request_rate_limit" };
  const res = await entrar();
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "Muitas tentativas. Espere alguns minutos e tente de novo." });
});

test("Auth fora do ar: 503, não 'senha incorreta'", async () => {
  falha = { status: 500, code: "unexpected_failure" };
  const original = console.error;
  console.error = () => {};
  try {
    const res = await entrar();
    assert.equal(res.status, 503);
    assert.match(((await res.json()) as { error: string }).error, /Não foi possível entrar agora/);
  } finally {
    console.error = original;
  }
});
