import assert from "node:assert/strict";
import test from "node:test";

import { tirarSessaoSupabase } from "./client";

function armazem(inicial: Record<string, string>) {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    get length() {
      return dados.size;
    },
    key: (i: number) => [...dados.keys()][i] ?? null,
    getItem: (k: string) => dados.get(k) ?? null,
    removeItem: (k: string) => void dados.delete(k),
  };
}

test("tira a sessão do supabase-js (token, verifier, user) e devolve o access_token", () => {
  const ls = armazem({
    "sb-abcdwxyz-auth-token": JSON.stringify({ access_token: "jwt-dela", refresh_token: "r" }),
    "sb-abcdwxyz-auth-token-code-verifier": "v",
    "sb-abcdwxyz-auth-token-user": "{}",
    hubflow_oauth_next: "/painel",
    "sb-abcdwxyz-outra-coisa": "fica",
  });
  assert.equal(tirarSessaoSupabase(ls), "jwt-dela");
  assert.deepEqual([...ls.dados.keys()].sort(), ["hubflow_oauth_next", "sb-abcdwxyz-outra-coisa"]);
});

test("sem sessão guardada devolve null e não mexe em nada", () => {
  const ls = armazem({ tema: "claro" });
  assert.equal(tirarSessaoSupabase(ls), null);
  assert.deepEqual([...ls.dados.keys()], ["tema"]);
});

test("valor ilegível ainda é apagado, sem token", () => {
  const ls = armazem({ "sb-x-auth-token": "{quebrado" });
  assert.equal(tirarSessaoSupabase(ls), null);
  assert.equal(ls.dados.size, 0);
});
