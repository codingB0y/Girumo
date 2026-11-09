import assert from "node:assert/strict";
import { test } from "node:test";

import type { EventoYampiGravado } from "@/lib/stores/yampi-eventos";

import type { ConsumidorDeEvento, EventoParaConsumir } from "./consumidores";
import { processarEventoYampi, type DepsDoProcessador } from "./processar";
import type { ConexaoYampi, EventoYampi } from "./tipos";

/** O processador em memória: sem rede e sem banco. */

const ENVELOPE = {
  event: "order.paid", time: "2026-10-29 10:00:00", merchant: { alias: "loja-exemplo" },
  resource: { id: 42, customer: { phone: "5511999990000" } },
};

function eventoGravado(over: Partial<EventoYampiGravado> = {}): EventoYampiGravado {
  return {
    id: "e1", tenantId: "loja-a", connectionId: "c1", event: "order.paid", resourceId: "42", payload: ENVELOPE,
    receivedAt: "2026-10-29T13:00:00Z", processedAt: null, error: null, ...over,
  };
}

const CONEXAO: ConexaoYampi = {
  id: "c1", tenantId: "loja-a", alias: "loja-exemplo", status: "ativa", userTokenSelado: "v1.t", userSecretKeySelado: "v1.k",
  webhookId: "7", webhookSecretSelado: "v1.s", lastEventAt: null, lastCheckAt: null, lastError: null,
};

function mundo(o: { eventos?: EventoYampiGravado[]; conexao?: ConexaoYampi | null; consumidores: ConsumidorDeEvento[] }) {
  const chamadas: string[] = [];
  const eventos = o.eventos ?? [eventoGravado()];
  const deps: DepsDoProcessador = {
    lerEvento: async (id) => eventos.find((e) => e.id === id) ?? null,
    lerConexao: async () => (o.conexao === undefined ? CONEXAO : o.conexao),
    marcarProcessado: async (_t, id, nota) => { chamadas.push(nota ? `processado ${id} ${nota}` : `processado ${id}`); },
    marcarErro: async (_t, id, erro) => { chamadas.push(`erro ${id}: ${erro}`); },
    consumidores: o.consumidores,
  };
  return { deps, chamadas };
}

function consumidor(nome: string, over: Partial<ConsumidorDeEvento> = {}, registro: string[] = []): ConsumidorDeEvento {
  return {
    nome,
    eventos: ["order.paid"],
    ligado: async () => true,
    consumir: async () => { registro.push(nome); },
    ...over,
  };
}

test("sem consumidor nenhum: marca processado e mais nada", async () => {
  const { deps, chamadas } = mundo({ consumidores: [] });
  await processarEventoYampi("e1", deps);
  assert.deepEqual(chamadas, ["processado e1"]);
});

test("chama só os consumidores ligados que assinam o evento", async () => {
  const registro: string[] = [];
  const { deps } = mundo({
    consumidores: [
      consumidor("a", {}, registro),
      consumidor("b", { eventos: ["cart.reminder"] }, registro), // não assina
      consumidor("c", { ligado: async () => false }, registro), // desligado na loja
    ],
  });
  await processarEventoYampi("e1", deps);
  assert.deepEqual(registro, ["a"]);
});

test("o consumidor recebe a loja, a conexão, o evento, o time e o recurso do envelope", async () => {
  const vistos: EventoParaConsumir[] = [];
  const { deps } = mundo({ consumidores: [consumidor("a", { consumir: async (e) => { vistos.push(e); } })] });
  await processarEventoYampi("e1", deps);
  const [visto] = vistos;
  assert.deepEqual([visto.eventoId, visto.tenantId, visto.evento, visto.time, visto.conexao.id], ["e1", "loja-a", "order.paid", "2026-10-29 10:00:00", "c1"]);
  assert.equal((visto.recurso as { id: number }).id, 42);
  assert.deepEqual(visto.payload, ENVELOPE);
});

test("um consumidor que falha não impede o outro: o outro roda, o evento NÃO é marcado processado, o erro leva nome e mensagem, e a função lança", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const registro: string[] = [];
  const { deps, chamadas } = mundo({
    consumidores: [consumidor("a", { consumir: async () => { throw new Error("falha ao gravar pedido"); } }), consumidor("b", {}, registro)],
  });
  await assert.rejects(processarEventoYampi("e1", deps), /1 consumidor/);
  assert.deepEqual(registro, ["b"]);
  assert.deepEqual(chamadas, ["erro e1: a: falha ao gravar pedido"]);
  // O log leva o id e o nome; a mensagem (que pode citar o pedido) fica só na coluna.
  const logado = log.mock.calls.map((c) => c.arguments.join(" ")).join("\n");
  assert.match(logado, /e1/);
  assert.doesNotMatch(logado, /falha ao gravar pedido/);
});

test("ligado que lança conta como falha do consumidor", async (t) => {
  t.mock.method(console, "error", () => {});
  const { deps, chamadas } = mundo({ consumidores: [consumidor("a", { ligado: async () => { throw new Error("banco fora"); } })] });
  await assert.rejects(processarEventoYampi("e1", deps));
  assert.deepEqual(chamadas, ["erro e1: a: banco fora"]);
});

test("só marca processado depois de todos os consumidores terminarem", async () => {
  const ordem: string[] = [];
  const lento = consumidor("lento", { consumir: async () => { await new Promise((r) => setTimeout(r, 20)); ordem.push("lento terminou"); } });
  const { deps } = mundo({ consumidores: [lento, consumidor("rapido", { consumir: async () => { ordem.push("rapido terminou"); } })] });
  deps.marcarProcessado = async () => { ordem.push("processado"); };
  await processarEventoYampi("e1", deps);
  assert.deepEqual(ordem, ["rapido terminou", "lento terminou", "processado"]);
});

test("evento já processado: ninguém é chamado; evento inexistente: nada acontece", async () => {
  const registro: string[] = [];
  const ja = mundo({ eventos: [eventoGravado({ processedAt: "2026-10-29T13:01:00Z" })], consumidores: [consumidor("a", {}, registro)] });
  await processarEventoYampi("e1", ja.deps);
  const nenhum = mundo({ consumidores: [consumidor("a", {}, registro)] });
  await processarEventoYampi("e9", nenhum.deps);
  assert.deepEqual([registro, ja.chamadas, nenhum.chamadas], [[], [], []]);
});

test("avisos fora de ordem: paid antes de created chegam, cada um, ao consumidor, na ordem em que são processados, sem erro", async () => {
  const registro: string[] = [];
  const eventos = [
    eventoGravado({ id: "e2", event: "order.paid", payload: { ...ENVELOPE, event: "order.paid" } }),
    eventoGravado({ id: "e1", event: "order.created", payload: { ...ENVELOPE, event: "order.created" } }),
  ];
  const { deps, chamadas } = mundo({
    eventos,
    consumidores: [consumidor("a", { eventos: ["order.created", "order.paid"], consumir: async (e) => { registro.push(e.evento); } })],
  });
  await processarEventoYampi("e2", deps);
  await processarEventoYampi("e1", deps);
  assert.deepEqual(registro, ["order.paid", "order.created"] satisfies EventoYampi[]);
  assert.deepEqual(chamadas, ["processado e2", "processado e1"]);
});

test("conexão desconectada, ausente ou de outra loja: marca processado com nota e não chama consumidor", async () => {
  for (const conexao of [{ ...CONEXAO, status: "desconectada" as const }, null, { ...CONEXAO, tenantId: "loja-b" }]) {
    const registro: string[] = [];
    const { deps, chamadas } = mundo({ conexao, consumidores: [consumidor("a", {}, registro)] });
    await processarEventoYampi("e1", deps);
    assert.deepEqual(registro, []);
    assert.deepEqual(chamadas, ["processado e1 conexão ausente, desconectada ou de outra loja"]);
  }
});

test("envelope que não lê mais: processado com nota, sem consumidor", async () => {
  const registro: string[] = [];
  const { deps, chamadas } = mundo({ eventos: [eventoGravado({ payload: { event: "order.paid" } })], consumidores: [consumidor("a", {}, registro)] });
  await processarEventoYampi("e1", deps);
  assert.deepEqual([registro, chamadas], [[], ["processado e1 envelope inválido"]]);
});

test("o erro gravado não carrega o payload (nem o telefone)", async (t) => {
  t.mock.method(console, "error", () => {});
  const { deps, chamadas } = mundo({ consumidores: [consumidor("a", { consumir: async () => { throw new Error("falhou"); } })] });
  await assert.rejects(processarEventoYampi("e1", deps));
  assert.deepEqual(chamadas, ["erro e1: a: falhou"]);
  assert.doesNotMatch(chamadas.join("\n"), /5511999990000/);
});
