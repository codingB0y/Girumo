import assert from "node:assert/strict";
import { test } from "node:test";

import type { EntregaNoGrupo, ResumoDaEntrega } from "@/lib/painel/entrega";
import type { Group } from "@/lib/mock-data";
import {
  fraseDoAndamento,
  gradeDaEntrega,
  placarDosGrupos,
  proximosAgendamentos,
  rotuloDaCelula,
  terminaPorVolta,
  textoDoPost,
  tituloDaGrade,
} from "./postando";

const CONVITE = "https://chat.whatsapp.com/abc";

function grupo(id: string, name: string): Group {
  return { id, name, whatsappGroupId: `${id}@g.us`, members: 100, capacity: 1000, selected: false, engagement: "medio", inviteUrl: CONVITE };
}

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

test("grade ordena pelo numero do grupo, depois os sem numero pelo nome, e o fora do cadastro por ultimo", () => {
  const grupos = [grupo("a", "X 2"), grupo("b", "X 10"), grupo("c", "X 9"), grupo("d", "Clientes antigos")];
  const entrega: EntregaNoGrupo[] = [
    { grupo: "fantasma@g.us", estado: "falhou", quando: null },
    { grupo: "d@g.us", estado: "na_fila", quando: null },
    { grupo: "b@g.us", estado: "postando", quando: null },
    { grupo: "a@g.us", estado: "entregue", quando: "2026-10-03T17:08:00Z" },
    { grupo: "c@g.us", estado: "na_fila", quando: null },
  ];
  const grade = gradeDaEntrega(entrega, grupos);
  assert.deepEqual(grade.map((c) => c.rotulo), ["#2", "#9", "#10", "Clientes antigos", "grupo fora do cadastro"]);
  assert.deepEqual(grade.map((c) => c.nome), ["X 2", "X 9", "X 10", "Clientes antigos", "grupo fora do cadastro"]);
  assert.equal(grade[0].estado, "entregue");
  assert.equal(grade[0].quando, "2026-10-03T17:08:00Z");
  assert.equal(grade[0].id, "a@g.us");
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

test("rotulo da celula diz o estado por extenso e nao repete o nome igual ao rotulo", () => {
  const base = { id: "a@g.us", rotulo: "#3", nome: "Moda Sul 03", quando: null };
  assert.equal(rotuloDaCelula({ ...base, estado: "entregue", quando: "2026-10-03T17:08:00Z" }), "#3, Moda Sul 03: entregue às 14:08");
  assert.equal(rotuloDaCelula({ ...base, estado: "postando" }), "#3, Moda Sul 03: postando");
  assert.equal(rotuloDaCelula({ ...base, estado: "na_fila" }), "#3, Moda Sul 03: na fila");
  assert.equal(rotuloDaCelula({ ...base, estado: "falhou" }), "#3, Moda Sul 03: falhou");
  assert.equal(rotuloDaCelula({ ...base, estado: "cancelado" }), "#3, Moda Sul 03: cancelado");
  assert.equal(rotuloDaCelula({ ...base, nome: "#3", estado: "na_fila" }), "#3: na fila");
});

test("grupo sem numero usa o nome, cortado, e nunca uma posicao", () => {
  const nome = "Clientes antigas de Fortaleza e região";
  const [c] = gradeDaEntrega([{ grupo: "d@g.us", estado: "na_fila", quando: null }], [grupo("d", nome)]);
  assert.equal(c.nome, nome);
  assert.ok(c.rotulo.endsWith("…") && c.rotulo.length < nome.length);
  assert.ok(!/\dº/.test(c.rotulo));
  // A etiqueta cortada nao repete o nome inteiro: o nome completo basta.
  assert.equal(rotuloDaCelula(c), `${nome}: na fila`);
});

test("rotulo do grupo fora do cadastro nao repete a frase", () => {
  const [c] = gradeDaEntrega([{ grupo: "x@g.us", estado: "falhou", quando: null }], []);
  assert.equal(rotuloDaCelula(c), "grupo fora do cadastro: falhou");
});

test("titulo da grade e placar no singular e no plural", () => {
  assert.equal(tituloDaGrade(1), "Entrega no 1 grupo");
  assert.equal(tituloDaGrade(40), "Entrega nos 40 grupos");
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
