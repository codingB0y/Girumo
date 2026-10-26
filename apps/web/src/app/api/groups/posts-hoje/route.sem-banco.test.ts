import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * Sem Supabase (`HUBFLOW_USE_SUPABASE=0`, o modo JSON) não há contagem a ler: a rota
 * diz isso em vez de devolver zeros que fariam o composer calar o aviso do teto.
 * Arquivo à parte porque `USE_SUPABASE` é lido uma vez, no carregamento do módulo.
 */
test("sem banco responde 501", async () => {
  process.env.HUBFLOW_USE_SUPABASE = "0";
  const { GET } = await import("./route");

  const res = await GET(new Request("http://girumo.test/api/groups/posts-hoje"));

  assert.equal(res.status, 501);
  assert.deepEqual(await res.json(), { error: "A contagem de posts de hoje precisa do banco." });
});
