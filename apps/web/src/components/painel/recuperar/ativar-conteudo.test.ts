import test from "node:test";
import assert from "node:assert/strict";
import { BENEFICIOS, INCLUI, PERGUNTAS, RODAPE_DO_PRECO } from "./ativar-conteudo";

const TUDO = [
  ...BENEFICIOS.flatMap((b) => [b.titulo, b.texto]),
  ...INCLUI,
  RODAPE_DO_PRECO,
  ...PERGUNTAS.flatMap((p) => [p.pergunta, p.resposta]),
].join("\n");

test("a tela fala em número do atendimento, nunca em número da recuperação", () => {
  assert.match(TUDO, /número do atendimento/i);
  assert.doesNotMatch(TUDO, /n[úu]mero da recupera[çc][ãa]o|chip da recupera[çc][ãa]o/i);
});

test("nenhum texto promete que o número não será restringido, e a resposta de segurança diz que a conexão é não oficial", () => {
  assert.doesNotMatch(TUDO, /100% seguro|sem risco|garantid|nunca (é|foi|será) (banid|bloquead|restring)/i);
  const seguro = PERGUNTAS.find((p) => /seguro/i.test(p.pergunta));
  assert.ok(seguro && /Nenhum controle garante/.test(seguro.resposta) && /não oficial/.test(seguro.resposta));
});

test("os quatro benefícios do mockup, na ordem, e o cancelamento sem multa", () => {
  assert.deepEqual(
    BENEFICIOS.map((b) => b.titulo),
    ["Pix pendente", "Carrinho abandonado", "Conversas com scripts", "Número do atendimento"],
  );
  assert.equal(PERGUNTAS.length, 5);
  assert.ok(INCLUI.includes("Cancele quando quiser, sem multa"));
});
