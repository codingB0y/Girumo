import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { ResultadoDaConferencia } from "./conferir";
import { AGENDA_DA_LIMPEZA, executarCronYampi, type DepsDoCron } from "./cron";

const AQUI = dirname(fileURLToPath(import.meta.url));
const INICIO = Date.parse("2026-11-09T12:00:00Z");

type Mundo = {
  parados?: string[];
  conexoes?: string[];
  conferencia?: Record<string, ResultadoDaConferencia | null | Error>;
  falhaNoEvento?: string[];
  limpar?: () => Promise<number>;
  saltoNoPrimeiroMs?: number;
};

function mundo(o: Mundo = {}) {
  const chamadas: string[] = [];
  const args: { parados?: unknown; conferir?: unknown } = {};
  let relogio = INICIO;
  const deps: DepsDoCron = {
    agora: () => relogio,
    listarParados: async (p) => { args.parados = p; chamadas.push("listarParados"); return o.parados ?? []; },
    processar: async (id) => {
      chamadas.push(`processar ${id}`);
      if (o.saltoNoPrimeiroMs && id === o.parados?.[0]) relogio += o.saltoNoPrimeiroMs;
      if (o.falhaNoEvento?.includes(id)) throw new Error("consumidor falhou");
    },
    listarParaConferir: async (antesDe, limite) => { args.conferir = { antesDe, limite }; chamadas.push("listarParaConferir"); return o.conexoes ?? []; },
    conferir: async (tenantId) => {
      chamadas.push(`conferir ${tenantId}`);
      const r = o.conferencia?.[tenantId];
      if (r instanceof Error) throw r;
      return r === undefined ? { credenciais: "ok", aviso: "ativo" } : r;
    },
    limpar: async () => { chamadas.push("limpar"); return (o.limpar ?? (async () => 0))(); },
  };
  return { deps, chamadas, args };
}

test("agenda da limpeza: só a limpeza roda, uma vez, e o número entra no resumo", async () => {
  const { deps, chamadas } = mundo({ limpar: async () => 7 });
  assert.deepEqual(await executarCronYampi(deps, AGENDA_DA_LIMPEZA), { reprocessados: 0, conferidas: 0, avisosRecriados: 0, limpos: 7, erros: 0 });
  assert.deepEqual(chamadas, ["limpar"]);
});

test("execução comum: reprocessa os parados (> 3 min, < 24 h, até 50) e confere as conexões sem checagem há 1 h (até 20); a limpeza não roda", async () => {
  const { deps, chamadas, args } = mundo({ parados: ["e1", "e2"], conexoes: ["loja-a", "loja-b"], conferencia: { "loja-b": { credenciais: "ok", aviso: "recriado" } } });
  const r = await executarCronYampi(deps, "*/5 * * * *");
  assert.deepEqual([r.reprocessados, r.conferidas, r.avisosRecriados, r.limpos, r.erros], [2, 2, 1, null, 0]);
  assert.deepEqual(args.parados, { antesDe: new Date(INICIO - 3 * 60_000), depoisDe: new Date(INICIO - 24 * 3_600_000), limite: 50 });
  assert.deepEqual(args.conferir, { antesDe: new Date(INICIO - 3_600_000), limite: 20 });
  assert.ok(!chamadas.includes("limpar"));
});

test("sem agenda (chamada manual) é a execução comum", async () => {
  const { deps, chamadas } = mundo();
  await executarCronYampi(deps, null);
  assert.deepEqual(chamadas, ["listarParados", "listarParaConferir"]);
});

test("um evento ou uma conexão que falha conta erro e não para os outros; conexão que some (null) não conta", async (t) => {
  t.mock.method(console, "error", () => {});
  const { deps, chamadas } = mundo({
    parados: ["e1", "e2"], falhaNoEvento: ["e1"], conexoes: ["loja-a", "loja-b", "loja-c"],
    conferencia: { "loja-a": new Error("banco fora"), "loja-c": null },
  });
  const r = await executarCronYampi(deps, "*/5 * * * *");
  assert.deepEqual([r.reprocessados, r.conferidas, r.erros], [1, 1, 2]);
  assert.ok(chamadas.includes("processar e2") && chamadas.includes("conferir loja-b"));
});

test("depois de 90 s não começa outro evento (o relógio salta durante o primeiro)", async () => {
  const { deps, chamadas } = mundo({ parados: ["e1", "e2", "e3"], saltoNoPrimeiroMs: 91_000 });
  const r = await executarCronYampi(deps, "*/5 * * * *");
  assert.equal(r.reprocessados, 1);
  assert.deepEqual(chamadas.filter((c) => c.startsWith("processar")), ["processar e1"]);
  assert.ok(chamadas.includes("listarParaConferir"), "a conferência roda mesmo assim");
});

test("depois de 180 s não começa outra conferência (a loja de fora é a primeira da próxima volta)", async () => {
  const { deps, chamadas } = mundo({ conexoes: ["loja-a", "loja-b"] });
  const conferir = deps.conferir;
  let relogio = INICIO;
  deps.agora = () => relogio;
  deps.conferir = async (t) => { relogio += 181_000; return conferir(t); };
  const r = await executarCronYampi(deps, "*/5 * * * *");
  assert.equal(r.conferidas, 1);
  assert.deepEqual(chamadas.filter((c) => c.startsWith("conferir")), ["conferir loja-a"]);
});

test("listagem que lança conta erro e não impede o outro passo; limpeza que lança: erros 1 e o resto do resumo preservado", async (t) => {
  t.mock.method(console, "error", () => {});
  const { deps, chamadas } = mundo({ conexoes: ["loja-a"] });
  deps.listarParados = async () => { throw new Error("banco fora"); };
  const r = await executarCronYampi(deps, "*/5 * * * *");
  assert.deepEqual([r.reprocessados, r.conferidas, r.erros], [0, 1, 1]);
  assert.ok(chamadas.includes("conferir loja-a"));
  const limpeza = mundo({ limpar: async () => { throw new Error("rpc falhou"); } });
  assert.deepEqual(await executarCronYampi(limpeza.deps, AGENDA_DA_LIMPEZA), { reprocessados: 0, conferidas: 0, avisosRecriados: 0, limpos: null, erros: 1 });
});

test("vercel.json tem as duas agendas da rota e a da limpeza é AGENDA_DA_LIMPEZA", () => {
  const crons = JSON.parse(readFileSync(join(AQUI, "..", "..", "..", "vercel.json"), "utf8")).crons as Array<{ path: string; schedule: string }>;
  assert.deepEqual(crons.filter((c) => c.path === "/api/cron/yampi").map((c) => c.schedule).sort(), ["*/5 * * * *", AGENDA_DA_LIMPEZA].sort());
});
