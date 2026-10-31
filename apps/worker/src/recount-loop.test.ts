import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AppRequestError, type AppClient } from "./app-client.js";
import {
  RECOUNT_TIMEOUT_MS,
  listRecountTenants,
  makeRecountDeps,
  runRecountTick,
  withRecountDryRun,
  type RecountDeps,
} from "./recount-loop.js";

/** Deps de mentira: três lojas, 10 grupos cada; conta quantas recontagens correm juntas. */
function makeDeps(over: Partial<RecountDeps> = {}): { deps: RecountDeps; chamados: string[]; maxEmVoo: () => number } {
  const chamados: string[] = [];
  let emVoo = 0;
  let maximo = 0;
  const deps: RecountDeps = {
    listTenants: async () => ["t-a", "t-b", "t-c"],
    recount: async (tenantId) => {
      emVoo += 1;
      maximo = Math.max(maximo, emVoo);
      chamados.push(tenantId);
      await new Promise((pronto) => setTimeout(pronto, 5));
      emVoo -= 1;
      return 10;
    },
    ...over,
  };
  return { deps, chamados, maxEmVoo: () => maximo };
}

/** Supabase de mentira para `from("instances").select(...).eq(...).eq(...)`; anota cada filtro. */
function supabaseFalso(linhas: Array<{ tenant_id: string }>) {
  const consulta: { tabela?: string; colunas?: string; filtros: Array<[string, string]> } = { filtros: [] };
  const client = {
    from(tabela: string) {
      consulta.tabela = tabela;
      return {
        select(colunas: string) {
          consulta.colunas = colunas;
          const cadeia = {
            eq(coluna: string, valor: string) {
              consulta.filtros.push([coluna, valor]);
              return cadeia;
            },
            then(pronto: (r: { data: typeof linhas; error: null }) => unknown) {
              return Promise.resolve({ data: linhas, error: null }).then(pronto);
            },
          };
          return cadeia;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, consulta };
}

test("reconta uma loja por vez e soma os grupos atualizados", async () => {
  const d = makeDeps();

  const r = await runRecountTick(d.deps);

  assert.deepEqual(r, { tenants: 3, atualizados: 30, pulados: 0, falhas: 0 });
  assert.deepEqual(d.chamados, ["t-a", "t-b", "t-c"]);
  // Mutante: Promise.all — três fetchAllGroups de até 50 s ao mesmo tempo na mesma Evolution.
  assert.equal(d.maxEmVoo(), 1);
});

test("409 (Sincronizar do lojista rodando, ou número caiu) é pulado, não falha, e a próxima loja segue", async () => {
  const d = makeDeps({
    recount: async (tenantId) => {
      if (tenantId === "t-b") throw new AppRequestError(409, "/api/groups/recount", "ja estao sendo sincronizados");
      return 4;
    },
  });

  assert.deepEqual(await runRecountTick(d.deps), { tenants: 3, atualizados: 8, pulados: 1, falhas: 0 });
});

test("erro de uma loja não derruba as outras", async () => {
  const d = makeDeps({
    recount: async (tenantId) => {
      if (tenantId === "t-a") throw new AppRequestError(504, "/api/groups/recount", "demorou");
      return 2;
    },
  });

  assert.deepEqual(await runRecountTick(d.deps), { tenants: 3, atualizados: 4, pulados: 0, falhas: 1 });
});

test("worker encerrando para entre uma loja e outra", async () => {
  let parar = false;
  const d = makeDeps({
    recount: async () => {
      parar = true;
      return 1;
    },
  });

  assert.deepEqual(await runRecountTick(d.deps, () => parar), { tenants: 3, atualizados: 1, pulados: 0, falhas: 0 });
});

test("DRY-RUN lista as lojas e não chama o app", async () => {
  let chamou = 0;
  const d = makeDeps({
    recount: async () => {
      chamou += 1;
      return 9;
    },
  });

  assert.deepEqual(await runRecountTick(withRecountDryRun(d.deps)), { tenants: 3, atualizados: 0, pulados: 0, falhas: 0 });
  assert.equal(chamou, 0);
});

test("a recontagem chama a rota engine do app com a loja e lê os atualizados", async () => {
  const posts: Array<{ tenantId: string; path: string; body: unknown }> = [];
  const app: AppClient = {
    async post<T>(tenantId: string, path: string, body?: unknown): Promise<T> {
      posts.push({ tenantId, path, body });
      return { ok: true, atualizados: 7 } as unknown as T;
    },
  };

  const deps = makeRecountDeps(supabaseFalso([]).client, app);

  assert.equal(await deps.recount("t-a"), 7);
  assert.deepEqual(posts, [{ tenantId: "t-a", path: "/api/groups/recount", body: undefined }]);
});

test("lojas = quem tem número dos grupos conectado, cada uma uma vez, em ordem estável", async () => {
  const s = supabaseFalso([{ tenant_id: "t-b" }, { tenant_id: "t-a" }, { tenant_id: "t-b" }]);

  assert.deepEqual(await listRecountTenants(s.client), ["t-a", "t-b"]);
  // Mutante: sem o filtro de purpose, a loja só com o número do atendimento entraria na recontagem de grupos.
  assert.deepEqual(s.consulta, {
    tabela: "instances",
    colunas: "tenant_id",
    filtros: [["status", "connected"], ["purpose", "grupos"]],
  });
});

test("o teto do worker passa do maxDuration da rota (60 s)", () => {
  // Com os 20 s padrão do client, toda recontagem de loja grande (fetchAllGroups de
  // 30–50 s) seria contada como falha, com o app tendo terminado o trabalho.
  assert.ok(RECOUNT_TIMEOUT_MS > 60_000);
});
