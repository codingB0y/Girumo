import { test } from "node:test";
import assert from "node:assert/strict";
import { campanhasParadas, gruposSemConvite } from "./alertas";

const DESDE = "2026-10-13T12:00:00.000Z";

test("grupo com link de convite não conta como sem convite", () => {
  // O defeito: a leitura não trazia `invite_url`, então TODO grupo parecia sem
  // convite — "57 grupos sem convite" numa loja com 56 configurados.
  const grupos = [
    { id: "g1", invite_url: "https://chat.whatsapp.com/abc" },
    { id: "g2", invite_url: null },
    { id: "g3", invite_url: "   " },
  ];
  assert.deepEqual(gruposSemConvite(grupos).map((g) => g.id), ["g2", "g3"]);
});

test("campanha editada há mais de 3 dias e sem clique está parada", () => {
  const campanhas = [{ id: "c1", updated_at: "2026-10-01T00:00:00.000Z" }];
  assert.deepEqual(campanhasParadas(campanhas, DESDE).map((c) => c.id), ["c1"]);
});

test("campanha com clique nos últimos 3 dias não está parada", () => {
  // `updated_at` só muda quando o lojista edita a campanha. A MODA SUL recebeu
  // "parada há 3+ dias" com 658 cliques no período.
  const campanhas = [
    { id: "c1", updated_at: "2026-10-01T00:00:00.000Z" },
    { id: "c2", updated_at: "2026-10-01T00:00:00.000Z" },
  ];
  assert.deepEqual(campanhasParadas(campanhas, DESDE, new Set(["c1"])).map((c) => c.id), ["c2"]);
});

test("campanha editada dentro da janela não está parada", () => {
  // `+00:00` (formato do Postgres) contra `Z` (toISOString): comparar texto
  // erraria no mesmo instante; a comparação é por data.
  const campanhas = [
    { id: "c1", updated_at: "2026-10-14T00:00:00+00:00" },
    { id: "c2", updated_at: null },
  ];
  assert.deepEqual(campanhasParadas(campanhas, DESDE), []);
});
