import assert from "node:assert/strict";
import { test } from "node:test";
import { rodarCronRastreio, type DepsCron } from "@/lib/rastreio/cron";
import { MATRIZ_PADRAO, type RastreioConfig } from "@/lib/rastreio/tipos";
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
const CONFIG_IMPORTADA: RastreioConfig = { ...CONFIG, importedAt: "2026-10-01T00:00:00.000Z" };
const AGORA = new Date("2026-10-29T15:00:00Z");
const ERRO_401 = new YampiErro(401, "token inválido");
const ERRO_429 = new YampiErro(429, "limite", 30_000);
const ERRO_SEM_RESPOSTA = new YampiErro(0, "timeout");

function montar(extra: Partial<DepsCron> = {}) {
  const log = {
    garantir: [] as unknown[], importar: [] as unknown[], cursor: [] as unknown[],
    importado: [] as unknown[], varrer: [] as unknown[], purgar: 0,
  };
  const deps: DepsCron = {
    lojas: async () => ["loja-a", "loja-b"],
    lerConfig: async () => CONFIG_IMPORTADA,
    garantirConfig: async (id) => { log.garantir.push(id); return CONFIG; },
    conexao: async () => CONEXAO,
    importar: async (id, desde) => { log.importar.push([id, desde]); return 0; },
    avancarCursor: async (id, c) => { log.cursor.push([id, c]); },
    marcarImportado: async (id, em) => { log.importado.push([id, em]); },
    varrer: async (id) => { log.varrer.push(id); return 0; },
    purgar: async () => { log.purgar++; return 3; },
    ...extra,
  };
  return { deps, log };
}

test("loja nova: config, 30 dias importados, cursor no começo da importação e marcada", async () => {
  const { deps, log } = montar({ lojas: async () => ["loja-a"], lerConfig: async () => null });
  assert.deepEqual(await rodarCronRastreio(AGORA, deps), { lojas: 1, falhas: 0, purgados: null });
  assert.deepEqual([log.garantir, log.importar, log.cursor, log.importado, log.varrer],
    [["loja-a"], [["loja-a", new Date("2026-09-29T15:00:00Z")]], [["loja-a", "2026-10-29T15:00:00.000Z"]], [["loja-a", AGORA]], ["loja-a"]]);
});

const DA_YAMPI: Array<[erro: YampiErro, motivo: string]> = [
  [ERRO_401, "a Yampi recusou a credencial (401)"], [ERRO_429, "a Yampi limitou as chamadas (429)"], [ERRO_SEM_RESPOSTA, "a Yampi não respondeu"],
];
test("erro da Yampi numa loja (401, 429, sem resposta) não para as outras", async (t) => {
  for (const [erro, motivo] of DA_YAMPI) await t.test(motivo, async (t) => {
    const erros: string[] = [];
    t.mock.method(console, "error", (m: unknown) => erros.push(String(m)));
    const { deps, log } = montar({ varrer: async (id) => { log.varrer.push(id); if (id === "loja-a") throw erro; return 0; } });
    assert.deepEqual(await rodarCronRastreio(AGORA, deps), { lojas: 2, falhas: 1, purgados: null });
    assert.deepEqual([log.varrer, erros], [["loja-a", "loja-b"], [`[rastreio/cron] varrer loja-a: ${motivo}`]]);
  });
});

test("loja já importada só varre", async () => {
  const { deps, log } = montar();
  assert.deepEqual(await rodarCronRastreio(AGORA, deps), { lojas: 2, falhas: 0, purgados: null });
  assert.deepEqual([log.importar, log.varrer], [[], ["loja-a", "loja-b"]]);
});

test("sem Yampi conectada não importa nem varre, e não é falha", async () => {
  const { deps, log } = montar({ lerConfig: async () => null, conexao: async () => null });
  assert.deepEqual(await rodarCronRastreio(AGORA, deps), { lojas: 2, falhas: 0, purgados: null });
  assert.deepEqual([log.importar, log.varrer], [[], []]);
});

test("importação que falha tenta de novo na rodada seguinte", async (t) => {
  t.mock.method(console, "error", () => {});
  const { deps, log } = montar({ lojas: async () => ["loja-a"], lerConfig: async () => null, importar: async () => { throw ERRO_429; } });
  assert.deepEqual(await rodarCronRastreio(AGORA, deps), { lojas: 1, falhas: 1, purgados: null });
  assert.deepEqual([log.cursor, log.importado, log.varrer], [[], [], []]);
});

test("purge uma vez por dia, na execução das 06:00 UTC", async () => {
  for (const [hora, esperado, chamadas] of [
    ["2026-10-30T06:02:00Z", 3, 1], ["2026-10-30T06:07:00Z", null, 0], ["2026-10-30T18:02:00Z", null, 0],
  ] as const) {
    const { deps, log } = montar();
    assert.deepEqual(await rodarCronRastreio(new Date(hora), deps), { lojas: 2, falhas: 0, purgados: esperado });
    assert.equal(log.purgar, chamadas, hora);
  }
});

test("sem a lista de lojas a execução lança", async () => {
  const { deps } = montar({ lojas: async () => { throw new Error("banco fora"); } });
  await assert.rejects(rodarCronRastreio(AGORA, deps), /banco fora/);
});
