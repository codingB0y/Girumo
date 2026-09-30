import assert from "node:assert/strict";
import { test } from "node:test";

import type { DispatchView } from "@/lib/campaigns/dispatch-view";
import { aindaSaindo, estadoDaEntrega, postDaTabela, resumoDaEntrega, type EntregaNoGrupo } from "./entrega";

// qua 23/09/2026 14:10 em Brasília (UTC-3).
const agora = new Date("2026-09-23T17:10:00Z");
const br = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString();

test("o status do comando vira o estado que a tela mostra; desconhecido fica de fora", () => {
  assert.equal(estadoDaEntrega("done"), "entregue");
  assert.equal(estadoDaEntrega("processing"), "postando");
  assert.equal(estadoDaEntrega("queued"), "na_fila");
  assert.equal(estadoDaEntrega("failed"), "falhou");
  assert.equal(estadoDaEntrega("canceled"), "cancelado");
  assert.equal(estadoDaEntrega("algo-novo"), null);
});

test("o resumo conta cada estado e diz se ainda tem grupo esperando", () => {
  const g = (estado: EntregaNoGrupo["estado"], i: number): EntregaNoGrupo => ({ grupo: `${i}@g.us`, estado, quando: null });
  const grupos = [
    ...Array.from({ length: 27 }, (_, i) => g("entregue", i)),
    g("postando", 27),
    ...Array.from({ length: 12 }, (_, i) => g("na_fila", 28 + i)),
    g("falhou", 40),
  ];
  const resumo = resumoDaEntrega(grupos);
  assert.deepEqual(resumo, { entregues: 27, postando: 1, naFila: 12, falharam: 1, cancelados: 0, total: 41 });
  assert.equal(aindaSaindo(resumo), true);
  assert.equal(aindaSaindo(resumoDaEntrega([g("entregue", 1), g("falhou", 2), g("cancelado", 3)])), false);
});

function post(extra: Partial<DispatchView>): DispatchView {
  return {
    id: "p",
    campaignId: "c",
    campaignSlug: "vip",
    type: "text",
    body: "Post",
    groupIds: [],
    mentionAll: false,
    recurrence: "none",
    status: "sent",
    sent: 0,
    total: 0,
    createdAt: br("2026-09-23", "06:00"),
    ...extra,
  };
}

test("a tabela acompanha o post que está saindo; sem isso, o último que saiu hoje", () => {
  const novidades = post({ id: "novidades", status: "sent", dispatchedAt: br("2026-09-23", "06:30") });
  const almoco = post({ id: "almoco", status: "failed", dispatchedAt: br("2026-09-23", "12:00") });
  const ontem = post({ id: "ontem", status: "sent", dispatchedAt: br("2026-09-22", "18:00") });
  const saindo = post({ id: "reposicao", status: "running", runningSince: br("2026-09-23", "14:08") });
  const agendado = post({ id: "amanha", status: "scheduled", scheduledAt: br("2026-09-24", "06:30") });

  assert.equal(postDaTabela([novidades, saindo, almoco, ontem], agora)?.id, "reposicao");
  assert.equal(postDaTabela([novidades, almoco, ontem, agendado], agora)?.id, "almoco");
  assert.equal(postDaTabela([ontem, agendado], agora), null, "post de ontem e agendado não viram coluna");
});
