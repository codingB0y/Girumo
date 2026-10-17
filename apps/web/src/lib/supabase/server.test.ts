import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { getSupabaseAdmin } from "./server";

/**
 * O cliente admin é singleton de módulo: a mesma instância serve todas as requisições de uma
 * instância quente da Vercel. Se uma chamada de auth (signInWithPassword) guardar a sessão do
 * usuário nele, o `fetchWithAuth` do supabase-js passa a mandar o JWT DESSE usuário no
 * Authorization de toda query seguinte — o "admin" vira `authenticated` e esbarra em RLS/grant.
 */

const CHAVE_SERVICE = "chave-service-falsa";
const fetchOriginal = globalThis.fetch;
const authorizationDoRest: string[] = [];

before(() => {
  process.env.SUPABASE_URL = "http://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = CHAVE_SERVICE;
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const json = { "content-type": "application/json" };
    if (url.includes("/auth/v1/token")) {
      const sessao = {
        access_token: "jwt-do-usuario",
        refresh_token: "refresh-do-usuario",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: "usuario-1", aud: "authenticated", email: "a@b.co" },
      };
      return new Response(JSON.stringify(sessao), { status: 200, headers: json });
    }
    if (url.includes("/rest/v1/")) {
      authorizationDoRest.push(new Headers(init?.headers).get("Authorization") ?? "");
      return new Response("[]", { status: 200, headers: json });
    }
    return new Response("{}", { status: 404, headers: json });
  };
});
after(() => {
  globalThis.fetch = fetchOriginal;
});

test("login por senha no cliente admin não troca o papel das queries seguintes", async () => {
  const { data } = await getSupabaseAdmin().auth.signInWithPassword({ email: "a@b.co", password: "segredo" });
  assert.equal(data.session?.access_token, "jwt-do-usuario");

  await getSupabaseAdmin().from("organizations").select("id");

  assert.deepEqual(authorizationDoRest, [`Bearer ${CHAVE_SERVICE}`]);
});
