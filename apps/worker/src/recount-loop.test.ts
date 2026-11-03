import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AppRequestError, type AppClient } from "./app-client.js";
import {
  RECOUNT_FRESH_EVENTS,
  RECOUNT_MIN_GAP_HOURS,
  RECOUNT_TIMEOUT_MS,
  listCountedSince,
  listRecountTenants,
  makeRecountDeps,
  runRecountTick,
  tenantsDue,
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
    countedSince: async () => [],
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

/**
 * Supabase de mentira para `from(...).select(...)` seguido de filtros `eq`/`in`/`gte`;
 * anota cada filtro na ordem, para o teste provar a consulta e não só o resultado.
 */
function supabaseFalso(linhas: Array<{ tenant_id: string }>) {
  const consulta: { tabela?: string; colunas?: string; filtros: Array<[string, string, unknown]> } = { filtros: [] };
  const client = {
    from(tabela: string) {
      consulta.tabela = tabela;
      return {
        select(colunas: string) {
          consulta.colunas = colunas;
          const cadeia = {
            eq(coluna: string, valor: unknown) {
              consulta.filtros.push(["eq", coluna, valor]);
              return cadeia;
            },
            in(coluna: string, valores: unknown) {
              consulta.filtros.push(["in", coluna, valores]);
              return cadeia;
            },
            gte(coluna: string, valor: unknown) {
              consulta.filtros.push(["gte", coluna, valor]);
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

  assert.deepEqual(r, { tenants: 3, recentes: 0, atualizados: 30, pulados: 0, falhas: 0 });
  assert.deepEqual(d.chamados, ["t-a", "t-b", "t-c"]);
  // Mutante: Promise.all — três fetchAllGroups de até 50 s ao mesmo tempo na mesma Evolution.
  assert.equal(d.maxEmVoo(), 1);
});

test("loja com contagem fresca é pulada sem chamar o app; as outras seguem na ordem", async () => {
  const pedidos: Date[] = [];
  const agora = Date.UTC(2026, 10, 3, 12, 0, 0);
  const d = makeDeps({
    countedSince: async (since) => {
      pedidos.push(since);
      return ["t-b", "t-desconhecida"];
    },
  });

  const r = await runRecountTick(d.deps, () => false, () => agora);

  assert.deepEqual(r, { tenants: 3, recentes: 1, atualizados: 20, pulados: 0, falhas: 0 });
  assert.deepEqual(d.chamados, ["t-a", "t-c"]);
  // O gap é contado a partir do instante do tick, não de um relógio solto.
  assert.deepEqual(pedidos, [new Date(agora - RECOUNT_MIN_GAP_HOURS * 3_600_000)]);
});

test("todas frescas: o boot do container não lê o WhatsApp (nenhuma chamada ao app)", async () => {
  const d = makeDeps({ countedSince: async () => ["t-a", "t-b", "t-c"] });

  assert.deepEqual(await runRecountTick(d.deps), { tenants: 3, recentes: 3, atualizados: 0, pulados: 0, falhas: 0 });
  assert.deepEqual(d.chamados, []);
});

test("sem loja conectada não consulta o log nem o app", async () => {
  let consultou = 0;
  const d = makeDeps({
    listTenants: async () => [],
    countedSince: async () => {
      consultou += 1;
      return [];
    },
  });

  assert.deepEqual(await runRecountTick(d.deps), { tenants: 0, recentes: 0, atualizados: 0, pulados: 0, falhas: 0 });
  assert.equal(consultou, 0);
});

test("tenantsDue preserva a ordem e ignora loja fresca que não está na lista", () => {
  assert.deepEqual(tenantsDue(["t-c", "t-a", "t-b"], ["t-a", "t-x"]), ["t-c", "t-b"]);
  assert.deepEqual(tenantsDue([], ["t-a"]), []);
});

test("409 (Sincronizar do lojista rodando, ou número caiu) é pulado, não falha, e a próxima loja segue", async () => {
  const d = makeDeps({
    recount: async (tenantId) => {
      if (tenantId === "t-b") throw new AppRequestError(409, "/api/groups/recount", "ja estao sendo sincronizados");
      return 4;
    },
  });

  assert.deepEqual(await runRecountTick(d.deps), { tenants: 3, recentes: 0, atualizados: 8, pulados: 1, falhas: 0 });
});

test("erro de uma loja não derruba as outras", async () => {
  const d = makeDeps({
    recount: async (tenantId) => {
      if (tenantId === "t-a") throw new AppRequestError(504, "/api/groups/recount", "demorou");
      return 2;
    },
  });

  assert.deepEqual(await runRecountTick(d.deps), { tenants: 3, recentes: 0, atualizados: 4, pulados: 0, falhas: 1 });
});

test("worker encerrando para entre uma loja e outra", async () => {
  let parar = false;
  const d = makeDeps({
    recount: async () => {
      parar = true;
      return 1;
    },
  });

  assert.deepEqual(await runRecountTick(d.deps, () => parar), { tenants: 3, recentes: 0, atualizados: 1, pulados: 0, falhas: 0 });
});

test("DRY-RUN lista as lojas e não chama o app", async () => {
  let chamou = 0;
  const d = makeDeps({
    recount: async () => {
      chamou += 1;
      return 9;
    },
  });

  assert.deepEqual(await runRecountTick(withRecountDryRun(d.deps)), { tenants: 3, recentes: 0, atualizados: 0, pulados: 0, falhas: 0 });
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
    filtros: [
      ["eq", "status", "connected"],
      ["eq", "purpose", "grupos"],
    ],
  });
});

test("contagem fresca = groups.recounted OU groups.synced em logs desde o instante dado", async () => {
  const s = supabaseFalso([{ tenant_id: "t-b" }, { tenant_id: "t-b" }, { tenant_id: "t-a" }]);
  const since = new Date("2026-11-02T16:00:00.000Z");

  assert.deepEqual(await listCountedSince(s.client, since), ["t-a", "t-b"]);
  // Mutante: só `groups.recounted` — o Sincronizar do painel às 23h ganharia outra varredura à meia-noite.
  assert.deepEqual(s.consulta, {
    tabela: "logs",
    colunas: "tenant_id",
    filtros: [
      ["in", "event", ["groups.recounted", "groups.synced"]],
      ["gte", "created_at", "2026-11-02T16:00:00.000Z"],
    ],
  });
  assert.deepEqual([...RECOUNT_FRESH_EVENTS], ["groups.recounted", "groups.synced"]);
});

test("as deps reais ligam countedSince ao log, e o DRY-RUN preserva essa leitura", async () => {
  const s = supabaseFalso([{ tenant_id: "t-a" }]);
  const app: AppClient = { post: async () => ({}) as never };
  const deps = withRecountDryRun(makeRecountDeps(s.client, app));

  assert.deepEqual(await deps.countedSince(new Date(0)), ["t-a"]);
  assert.equal(s.consulta.tabela, "logs");
});

test("o gap fica abaixo do intervalo padrão de 24 h (senão o tick diário pularia dia sim, dia não)", () => {
  assert.ok(RECOUNT_MIN_GAP_HOURS < 24);
  assert.ok(RECOUNT_MIN_GAP_HOURS >= 12);
});

test("o teto do worker passa do maxDuration da rota (60 s)", () => {
  // Com os 20 s padrão do client, toda recontagem de loja grande (fetchAllGroups de
  // 30–50 s) seria contada como falha, com o app tendo terminado o trabalho.
  assert.ok(RECOUNT_TIMEOUT_MS > 60_000);
});
