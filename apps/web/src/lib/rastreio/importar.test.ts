import assert from "node:assert/strict";
import { test } from "node:test";
import { importarPedidos, varrerPedidos, type DepsImportar } from "@/lib/rastreio/importar";
import { MATRIZ_PADRAO, type PedidoGravado, type RastreioConfig } from "@/lib/rastreio/tipos";
import { pedidoYampi } from "@/test/rastreio-dados-falsos";
import { YampiErro } from "@/lib/yampi/cliente";
import type { ConexaoYampi } from "@/lib/yampi/tipos";

const CONEXAO: ConexaoYampi = {
  id: "cx-1", tenantId: "loja-a", alias: "loja-teste", status: "ativa", userTokenSelado: null, userSecretKeySelado: null,
  webhookId: null, webhookSecretSelado: null, lastEventAt: null, lastCheckAt: null, lastError: null,
};
const CONFIG: RastreioConfig = {
  tenantId: "loja-a", publicSlug: "loja-teste", matrix: MATRIZ_PADRAO, notifyStoreOnProblem: true,
  vipLinkId: null, storeWhatsapp: null, importedAt: null, sweepCursor: null,
};
const GRAVADO: PedidoGravado = {
  id: "ped-1", etapa: "enviado", etapaAnterior: null, mudou: true, linkToken: "0".repeat(32),
  paradoEm: null, temTelefone: false, temEmail: false,
};
const AGORA = new Date("2026-10-29T15:00:00Z");

function montar(paginas: unknown[][], extra: Partial<DepsImportar> = {}, config: RastreioConfig | null = CONFIG) {
  const log = { queries: [] as Record<string, unknown>[], registros: [] as unknown[][], cursores: [] as unknown[][] };
  const deps: DepsImportar = {
    conexao: async () => CONEXAO,
    get: (async (_c: unknown, _caminho: string, query: Record<string, unknown>) => {
      log.queries.push(query);
      return { data: paginas[Number(query.page) - 1] ?? [] };
    }) as DepsImportar["get"],
    registrar: async (t, p, o) => { log.registros.push([t, p, o]); return { gravado: GRAVADO, avisos: [] }; },
    lerConfig: async () => config,
    avancarCursor: async (...a) => { log.cursores.push(a); },
    pepper: () => "p".repeat(32),
    agora: () => AGORA,
    ...extra,
  };
  return { deps, log };
}
const cheia = (de = 0) => Array.from({ length: 100 }, (_, i) => pedidoYampi({ id: de + i + 1 }));

test("importação: 30 dias por updated_at, de 100 em 100, sem aviso", async () => {
  const { deps, log } = montar([cheia(), [pedidoYampi({ id: 101 })]]);
  assert.equal(await importarPedidos("loja-a", new Date("2026-09-29T15:00:00Z"), deps), 101);
  const base = { date: "updated_at:2026-09-29|2026-10-29", include: "customer,status,statuses", limit: 100 };
  assert.deepEqual(log.queries, [{ ...base, page: 1 }, { ...base, page: 2 }]);
  assert.ok(log.registros.every((r) => r[2] === "importacao"));
});

test("um pedido que não grava não para a importação", async () => {
  const { deps } = montar([[1, 2, 3].map((id) => pedidoYampi({ id }))], {
    registrar: async (_t, p) => {
      if ((p as { id: number }).id === 2) throw new Error("falhou");
      return { gravado: GRAVADO, avisos: [] };
    },
  });
  const erros: string[] = [];
  const orig = console.error;
  console.error = (m: string) => { erros.push(m); };
  try { assert.equal(await importarPedidos("loja-a", AGORA, deps), 2); } finally { console.error = orig; }
  assert.ok(erros[0].startsWith("[rastreio] loja-a: pedido 2 não gravou (importacao)"));
});

test("sem conexão lança; sem pepper nem consulta", async () => {
  const a = montar([], { conexao: async () => null });
  await assert.rejects(importarPedidos("loja-a", AGORA, a.deps), /conexão/);
  const b = montar([], { pepper: () => { throw new Error("RASTREIO_DOC_PEPPER ausente"); } });
  await assert.rejects(importarPedidos("loja-a", AGORA, b.deps), /RASTREIO_DOC_PEPPER/);
  assert.equal(b.log.queries.length, 0);
});

test("teto de 20 páginas", async () => {
  const { deps, log } = montar(Array.from({ length: 30 }, () => cheia()));
  const avisos: string[] = [];
  const orig = console.warn;
  console.warn = (m: string) => { avisos.push(m); };
  try { await importarPedidos("loja-a", AGORA, deps); } finally { console.warn = orig; }
  assert.equal(log.queries.length, 20);
  assert.deepEqual(avisos, ["[rastreio] loja-a: importacao parou no teto de 20 páginas"]);
});

test("varredura: cursor − 5 min até agora, só o que mudou, cursor anda", async () => {
  const { deps, log } = montar(
    [[
      pedidoYampi({ id: 1, updated_at: "2026-10-29 10:50:00" }),
      pedidoYampi({ id: 2, updated_at: "2026-10-29 10:56:00" }),
      pedidoYampi({ id: 3, updated_at: "2026-10-29 11:04:00" }),
    ]],
    {},
    { ...CONFIG, sweepCursor: "2026-10-29T14:00:00.000Z" },
  );
  assert.equal(await varrerPedidos("loja-a", new Date("2026-10-29T14:05:00Z"), deps), 2);
  assert.equal(log.queries[0].date, "updated_at:2026-10-29|2026-10-29");
  assert.deepEqual(log.registros.map((r) => [(r[1] as { id: number }).id, r[2]]), [[2, "varredura"], [3, "varredura"]]);
  assert.deepEqual(log.cursores, [["loja-a", "2026-10-29T14:05:00.000Z"]]);
});

test("varredura sem conexão não consulta nem anda o cursor", async () => {
  const { deps, log } = montar([], { conexao: async () => null });
  assert.equal(await varrerPedidos("loja-a", AGORA, deps), 0);
  assert.deepEqual([log.queries.length, log.cursores.length], [0, 0]);
});

test("varredura no teto anda o cursor mesmo assim", async () => {
  const { deps, log } = montar(Array.from({ length: 20 }, () => cheia()));
  const avisos: string[] = [];
  const orig = console.warn;
  console.warn = (m: string) => { avisos.push(m); };
  try { await varrerPedidos("loja-a", AGORA, deps); } finally { console.warn = orig; }
  assert.equal(log.queries.length, 10);
  assert.equal(log.cursores.length, 1);
  assert.ok(avisos.some((m) => m.includes("varredura parou no teto de 10 páginas")));
});

test("conexão com o aviso desativado lê do mesmo jeito", async () => {
  const { deps, log } = montar([[pedidoYampi({ id: 5, updated_at: "2026-10-29 11:58:00" })]], {
    conexao: async () => ({ ...CONEXAO, status: "aviso_desativado" }),
  });
  assert.equal(await varrerPedidos("loja-a", AGORA, deps), 1);
  assert.equal(log.queries.length, 1);
});

test("erro da Yampi sobe, e o cursor fica", async () => {
  const erros = [new YampiErro(401, "token"), new YampiErro(429, "limite", 30_000), new YampiErro(0, "sem resposta")];
  for (const erro of erros) {
    for (const rodar of [
      (d: DepsImportar) => importarPedidos("loja-a", AGORA, d),
      (d: DepsImportar) => varrerPedidos("loja-a", AGORA, d),
    ]) {
      const { deps, log } = montar([cheia()], {
        get: (async (_c: unknown, _p: string, query: Record<string, unknown>) => {
          if (query.page === 2) throw erro;
          return { data: cheia() };
        }) as DepsImportar["get"],
      });
      await assert.rejects(rodar(deps), (e) => e === erro && (e as YampiErro).status === erro.status && (e as YampiErro).retryAfterMs === erro.retryAfterMs);
      assert.equal(log.cursores.length, 0);
    }
  }
});

test("nenhum pedido gravou e todos falharam: importação e varredura lançam, e o cursor fica", async (t) => {
  t.mock.method(console, "error", () => {});
  const sempreFalha: Partial<DepsImportar> = { registrar: async () => { throw new Error("INTEGRATIONS_ENCRYPTION_KEY ausente"); } };
  const a = montar([[1, 2].map((id) => pedidoYampi({ id }))], sempreFalha);
  await assert.rejects(importarPedidos("loja-a", AGORA, a.deps), (e: Error) => e.message === "[rastreio] importacao: nenhum pedido gravou (2 falhas)");
  const b = montar([[pedidoYampi({ id: 5, updated_at: "2026-10-29 11:58:00" })]], sempreFalha);
  await assert.rejects(varrerPedidos("loja-a", AGORA, b.deps), /varredura: nenhum pedido gravou \(1 falhas\)/);
  assert.equal(b.log.cursores.length, 0);
});
