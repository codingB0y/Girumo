import assert from "node:assert/strict";
import { indexFunnelRuns } from "./agenda";

// `criado` e a ordem de insercao da confirmacao (uma etapa por vez, na ordem do roteiro).
const m = (id: string, run: string | undefined, criado: string, template = "live") => ({
  id, funnelTemplateId: run ? template : undefined, funnelRunId: run, createdAt: criado,
});

const idx = indexFunnelRuns([
  m("c", "r1", "2026-09-19T10:00:03Z"),
  m("a", "r1", "2026-09-19T10:00:01Z"),
  m("b", "r1", "2026-09-19T10:00:02Z"),
  m("solta", undefined, "2026-09-19T10:00:04Z"),
  m("z", "r2", "2026-09-19T11:00:00Z", "black-friday-atacado"),
]);

// Ordenado pela criacao dentro da mesma confirmacao.
assert.deepEqual(idx.get("a"), { label: "Lançamento de live", index: 1, total: 3 });
assert.deepEqual(idx.get("b"), { label: "Lançamento de live", index: 2, total: 3 });
assert.deepEqual(idx.get("c"), { label: "Lançamento de live", index: 3, total: 3 });
// Outra confirmacao, outro roteiro.
assert.deepEqual(idx.get("z"), { label: "Black Friday do atacado", index: 1, total: 1 });
// Mensagem fora do funil nao entra.
assert.equal(idx.has("solta"), false);
// Roteiro desconhecido (dado antigo) ganha rotulo generico.
const antigo = indexFunnelRuns([{ ...m("q", "r9", "2026-09-19T10:00:00Z"), funnelTemplateId: "sumiu" }]);
assert.equal(antigo.get("q")?.label, "Funil");

// Regressao (prod 21/09): cancelar ou enviar tira o `scheduledAt` da linha; a
// etapa nao pode mudar de numero. Etapa 1 enviada, 4 cancelada, 2 e 3 pendentes —
// o `scheduledAt` futuro das pendentes existe mas nao entra na ordem.
// Linhas como a Agenda recebe (DispatchView traz `scheduledAt` so nas pendentes).
const linhasDaAgenda = [
  { ...m("e2", "r4", "2026-09-21T17:12:18.5+00:00"), scheduledAt: "2026-09-23T22:45:00+00:00" },
  m("e4", "r4", "2026-09-21T17:12:21.2+00:00"),
  m("e1", "r4", "2026-09-21T17:12:17.9+00:00"),
  { ...m("e3", "r4", "2026-09-21T17:12:19.4+00:00"), scheduledAt: "2026-09-24T00:30:00+00:00" },
];
const misturado = indexFunnelRuns(linhasDaAgenda);
assert.deepEqual(["e1", "e2", "e3", "e4"].map((id) => misturado.get(id)?.index), [1, 2, 3, 4]);

// Mesmo segundo, larguras diferentes de fracao (como o PostgREST realmente
// serializa timestamptz): localeCompare inverteria a ordem por colacao ICU
// dependendo do locale; comparacao simples de string nao.
const misto = indexFunnelRuns([
  m("y", "r3", "2026-09-19T10:00:00.893866+00:00"),
  m("x", "r3", "2026-09-19T10:00:00+00:00"),
]);
assert.equal(misto.get("x")?.index, 1);
assert.equal(misto.get("y")?.index, 2);

console.log("funnels/agenda tests passed");
