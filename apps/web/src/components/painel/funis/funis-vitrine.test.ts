import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FunnelOverview, FunnelOverviewItem } from "@/lib/funnels/overview";
import { FunisVitrine, type FunisVitrineProps } from "./funis-vitrine";

const noop = () => {};

function item(runId: string, campanha: string, over: Partial<FunnelOverviewItem> = {}): FunnelOverviewItem {
  return {
    runId, templateId: "grade-do-dia", label: "Grade do dia", startedAt: "2026-09-20T10:00:00Z",
    steps: [{ id: `${runId}-1`, index: 1, label: "Grade de hoje", body: "", at: new Date(2026, 8, 30, 8, 0).toISOString(), status: "scheduled", sent: 0, total: 1 }],
    enviadas: 0, gruposEntregues: 0, gruposAlvo: 1, campaign: { slug: campanha.toLowerCase(), name: campanha },
    pendentes: [`${runId}-1`], quando: new Date(2026, 8, 30, 8, 0).toISOString(), ...over,
  };
}

function html(over: Partial<FunisVitrineProps> = {}) {
  const props: FunisVitrineProps = {
    overview: { agendados: [], enviados: [] }, erro: null, campanhas: [], escolhendo: false, escolhida: null,
    cancelando: null, onNovoFunil: noop, onEscolher: noop, onCancelar: noop, ...over,
  };
  return renderToStaticMarkup(createElement(FunisVitrine, props));
}

test("vazio: convida a começar, sem seções", () => {
  const h = html();
  assert.match(h, /Nenhum funil ainda/);
  assert.doesNotMatch(h, /Agendados/);
});

test("agendado mostra data, campanha, horários e Cancelar funil; enviado mostra EU QUERO e não cancela", () => {
  const overview: FunnelOverview = {
    agendados: [item("r1", "Kids")],
    enviados: [item("r2", "Bota", {
      pendentes: [], enviadas: 1,
      steps: [{ id: "x", index: 1, label: "Grade de hoje", body: "", at: new Date(2026, 8, 28, 8, 0).toISOString(), status: "sent", sent: 1, total: 1 }],
      offer: { broadcastId: "x", slots: 40, pediram: 17, atendidas: 10, vendeu: 8, desistiram: 2 },
    })],
  };
  const h = html({ overview });
  assert.match(h, /Kids/);
  assert.match(h, /30\/09/);
  assert.match(h, /08:00 grade de hoje/);
  assert.equal((h.match(/Cancelar funil/g) ?? []).length, 1);
  assert.match(h, /<b[^>]*>17<\/b> EU QUERO/);
  assert.doesNotMatch(h, /Nenhum funil ainda/);
});

test("novo funil: campanha sem grupo desabilitada; escolhida leva ao funil dela", () => {
  const campanhas = [{ slug: "kids", name: "Kids", grupos: 6 }, { slug: "verao", name: "Verão", grupos: 0 }];
  const semEscolha = html({ escolhendo: true, campanhas });
  assert.match(semEscolha, /sem grupos ainda/);
  const radios = semEscolha.match(/<input type="radio"[^>]*>/g) ?? [];
  assert.equal(radios.length, 2);
  assert.doesNotMatch(radios[0], /disabled/);
  assert.match(radios[1], /disabled/);
  assert.doesNotMatch(semEscolha, /Montar o funil/);
  const escolhida = html({ escolhendo: true, campanhas, escolhida: "kids" });
  assert.match(escolhida, /href="\/painel\/campanhas\/kids\?abrir=funil"/);
});

test("erro de carga aparece como alerta", () => {
  assert.match(html({ overview: null, erro: "Não deu pra carregar" }), /role="alert"[^>]*>Não deu pra carregar/);
});

test("funil saindo agora mostra o estado e não oferece cancelar", () => {
  const saindo = item("r3", "Kids", { pendentes: [] });
  const h = html({ overview: { agendados: [saindo], enviados: [] } });
  assert.match(h, /Saindo agora/);
  assert.doesNotMatch(h, /Cancelar funil/);
});
