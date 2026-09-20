import assert from "node:assert/strict";
import { indexFunnelRuns } from "./agenda";

const m = (id: string, run: string | undefined, at: string, template = "live") => ({
  id, funnelTemplateId: run ? template : undefined, funnelRunId: run, scheduledAt: at, createdAt: "2026-09-19T10:00:00Z",
});

const idx = indexFunnelRuns([
  m("c", "r1", "2026-10-10T21:30:00Z"),
  m("a", "r1", "2026-10-09T19:00:00Z"),
  m("b", "r1", "2026-10-10T19:45:00Z"),
  m("solta", undefined, "2026-10-12T10:00:00Z"),
  m("z", "r2", "2026-11-06T06:00:00Z", "black-friday-atacado"),
]);

// Ordenado por data dentro da mesma confirmacao.
assert.deepEqual(idx.get("a"), { label: "Lançamento de live", index: 1, total: 3 });
assert.deepEqual(idx.get("b"), { label: "Lançamento de live", index: 2, total: 3 });
assert.deepEqual(idx.get("c"), { label: "Lançamento de live", index: 3, total: 3 });
// Outra confirmacao, outro roteiro.
assert.deepEqual(idx.get("z"), { label: "Black Friday do atacado", index: 1, total: 1 });
// Mensagem fora do funil nao entra.
assert.equal(idx.has("solta"), false);
// Roteiro desconhecido (dado antigo) ganha rotulo generico.
const antigo = indexFunnelRuns([{ ...m("q", "r9", "2026-10-10T10:00:00Z"), funnelTemplateId: "sumiu" }]);
assert.equal(antigo.get("q")?.label, "Funil");

// Mesmo segundo, larguras diferentes de fracao (como o PostgREST realmente
// serializa timestamptz): localeCompare inverteria a ordem por colacao ICU
// dependendo do locale; comparacao simples de string nao.
const misto = indexFunnelRuns([
  { id: "y", funnelTemplateId: "live", funnelRunId: "r3", scheduledAt: "2026-10-10T21:30:00.893866+00:00", createdAt: "2026-09-19T10:00:00Z" },
  { id: "x", funnelTemplateId: "live", funnelRunId: "r3", scheduledAt: "2026-10-10T21:30:00+00:00", createdAt: "2026-09-19T10:00:00Z" },
]);
assert.equal(misto.get("x")?.index, 1);
assert.equal(misto.get("y")?.index, 2);

console.log("funnels/agenda tests passed");
