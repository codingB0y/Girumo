import assert from "node:assert/strict";
import { test } from "node:test";

import type { ResumoDaEntrega } from "@/lib/painel/entrega";
import {
  fraseDoAndamento,
  placarDosGrupos,
  proximosAgendamentos,
  segmentosDaEntrega,
  terminaPorVolta,
  textoDoPost,
  versaoDoPost,
} from "./postando";

function resumo(p: Partial<ResumoDaEntrega>): ResumoDaEntrega {
  return { entregues: 0, postando: 0, naFila: 0, falharam: 0, cancelados: 0, total: 0, ...p };
}

// 14:10:00 em Brasília (UTC-3).
const AGORA = new Date("2026-10-03T17:10:00Z");

test("termina por volta de agora + restantes x 6 s, em hora de Brasília", () => {
  // 13 x 6 s = 78 s -> 14:11:18
  assert.equal(terminaPorVolta(resumo({ postando: 1, naFila: 12, total: 20 }), AGORA), "14:11");
});

test("termina por volta vira null quando nada resta", () => {
  assert.equal(terminaPorVolta(resumo({ entregues: 5, falharam: 1, total: 6 }), AGORA), null);
});

test("segmentos da entrega: entregues sempre; enviando, na fila, falhou e cancelado só com gente", () => {
  assert.deepEqual(segmentosDaEntrega(resumo({ entregues: 27, postando: 1, naFila: 12, total: 40 })), [
    { estado: "entregue", n: 27, texto: "entregues" },
    { estado: "postando", n: 1, texto: "enviando" },
    { estado: "na_fila", n: 12, texto: "na fila" },
  ]);
  assert.deepEqual(segmentosDaEntrega(resumo({ entregues: 1, falharam: 1, cancelados: 2, total: 4 })), [
    { estado: "entregue", n: 1, texto: "entregue" },
    { estado: "falhou", n: 1, texto: "falhou" },
    { estado: "cancelado", n: 2, texto: "cancelados" },
  ]);
  assert.deepEqual(segmentosDaEntrega(resumo({ total: 0 })), [{ estado: "entregue", n: 0, texto: "entregues" }]);
});

test("proximos agendamentos: so pendentes futuros, em ordem, ate o limite", () => {
  const lista = [
    { id: "longe", campaignName: "Longe", scheduledAt: "2026-10-06T12:00:00Z", status: "pending" },
    { id: "passado", campaignName: "Passado", scheduledAt: "2026-10-03T12:00:00Z", status: "pending" },
    { id: "feito", campaignName: "Feito", scheduledAt: "2026-10-03T21:00:00Z", status: "done" },
    { id: "amanha", campaignName: "Amanhã", scheduledAt: "2026-10-04T09:30:00Z", status: "pending" },
    { id: "hoje", scheduledAt: "2026-10-03T22:00:00Z", status: "pending" },
    { id: "sem-data", campaignName: "Sem data", status: "pending" },
  ];
  const proximos = proximosAgendamentos(lista, AGORA);
  assert.deepEqual(proximos.map((p) => p.quando), ["19:00", "amanhã 06:30", "06/10 09:00"]);
  assert.deepEqual(proximos.map((p) => p.nome), ["Post agendado", "Amanhã", "Longe"]);
  assert.deepEqual(proximos.map((p) => p.id), ["hoje", "amanha", "longe"]);
  assert.equal(proximosAgendamentos(lista, AGORA, 2).length, 2);
});

test("placar no singular e no plural", () => {
  assert.equal(placarDosGrupos(1, 1), "1 de 1 grupo");
  assert.equal(placarDosGrupos(27, 40), "27 de 40 grupos");
  assert.equal(placarDosGrupos(0, 0), "0 de 0 grupos");
});

test("texto do post: enquete mostra a pergunta, o resto o corpo", () => {
  assert.equal(textoDoPost({ body: "Oi", poll: undefined }), "Oi");
  assert.equal(textoDoPost({ body: "", poll: { question: "Qual cor?", options: ["a", "b"] } }), "Qual cor?");
  assert.equal(textoDoPost({ body: "  ", poll: undefined }), "");
});

const post = (p: Partial<{ status: string; error?: string; sent: number; total: number }> = {}) => ({ status: "sent", sent: 0, total: 0, ...p });

test("frase: saindo com e sem estimativa", () => {
  const r = resumo({ postando: 1, naFila: 3, entregues: 4, total: 8 });
  assert.equal(fraseDoAndamento({ post: post({ status: "running" }), resumo: r, hora: "14:08", termino: "14:11" }), "termina por volta de 14:11");
  assert.equal(fraseDoAndamento({ post: post({ status: "running" }), resumo: r, hora: "14:08", termino: null }), "saindo agora");
  assert.equal(fraseDoAndamento({ post: post({ status: "queued" }), resumo: null, hora: "14:08", termino: null }), "saindo agora");
});

test("frase: saiu, sem e com falhas", () => {
  assert.equal(fraseDoAndamento({ post: post(), resumo: resumo({ entregues: 40, total: 40 }), hora: "14:08", termino: null }), "Saiu às 14:08 · 40 de 40");
  assert.equal(
    fraseDoAndamento({ post: post(), resumo: resumo({ entregues: 38, falharam: 2, total: 40 }), hora: "14:08", termino: null }),
    "Saiu às 14:08 · 38 de 40 · 2 falharam",
  );
  assert.equal(
    fraseDoAndamento({ post: post(), resumo: resumo({ entregues: 39, falharam: 1, total: 40 }), hora: "14:08", termino: null }),
    "Saiu às 14:08 · 39 de 40 · 1 falhou",
  );
  // Entrega ainda sem carregar: vale o contador do post.
  assert.equal(fraseDoAndamento({ post: post({ sent: 12, total: 12 }), resumo: null, hora: "14:08", termino: null }), "Saiu às 14:08 · 12 de 12");
});

test("frase: post que falhou nunca diz Saiu, com ou sem entrega lida", () => {
  assert.equal(fraseDoAndamento({ post: post({ status: "failed" }), resumo: null, hora: "14:08", termino: null }), "Não saiu");
  assert.equal(
    fraseDoAndamento({ post: post({ status: "failed", error: "número desconectado" }), resumo: null, hora: "14:08", termino: null }),
    "Não saiu · número desconectado",
  );
  assert.equal(
    fraseDoAndamento({ post: post({ status: "failed", error: "sem admin" }), resumo: resumo({ falharam: 3, total: 3 }), hora: "14:08", termino: null }),
    "Não saiu · sem admin",
  );
  // Todos os grupos falharam, mesmo com o post marcado como enviado.
  assert.equal(fraseDoAndamento({ post: post(), resumo: resumo({ falharam: 3, total: 3 }), hora: "14:08", termino: null }), "Não saiu · 3 falharam");
  assert.equal(fraseDoAndamento({ post: post(), resumo: resumo({ falharam: 1, total: 1 }), hora: "14:08", termino: null }), "Não saiu · 1 falhou");
});

test("failed vence: post que falhou nao fica saindo mesmo com linha na fila", () => {
  const r = resumo({ naFila: 2, falharam: 1, total: 3 });
  assert.equal(fraseDoAndamento({ post: post({ status: "failed", error: "sem admin" }), resumo: r, hora: "14:08", termino: "14:09" }), "Não saiu · sem admin");
  assert.equal(fraseDoAndamento({ post: post({ status: "failed" }), resumo: r, hora: "14:08", termino: null }), "Não saiu · 1 falhou");
});

test("versao do post muda so com status ou contagem diferentes", () => {
  const a = versaoDoPost({ status: "queued", sent: 0 });
  assert.equal(versaoDoPost({ status: "queued", sent: 0 }), a);
  assert.notEqual(versaoDoPost({ status: "running", sent: 0 }), a);
  assert.notEqual(versaoDoPost({ status: "running", sent: 5 }), versaoDoPost({ status: "running", sent: 0 }));
  assert.equal(versaoDoPost(null), 0);
});
