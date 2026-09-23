import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLeadMessage,
  limpaNome,
  PERGUNTA_GRUPOS,
  PERGUNTA_LOJA,
  PERGUNTA_SEGMENTO,
  withWhatsAppText,
} from "./lead-message";

test("a mensagem junta nome e respostas numa frase só", () => {
  const msg = buildLeadMessage("Josiane", [
    PERGUNTA_LOJA.options[1].phrase,
    PERGUNTA_GRUPOS.options[2].phrase,
  ]);
  assert.equal(
    msg,
    "Olá! Sou Josiane. Minha loja fica no Brás e tenho de 6 a 20 grupos. Quero ver a Girumo funcionando.",
  );
});

test("sem nome e sem resposta a mensagem continua valida", () => {
  assert.equal(buildLeadMessage("   ", []), "Olá! Quero ver a Girumo funcionando.");
  assert.equal(
    buildLeadMessage("", ["", PERGUNTA_SEGMENTO.options[0].phrase]),
    "Olá! Vendo roupa e acessórios. Quero ver a Girumo funcionando.",
  );
});

test("o nome digitado nao vira paragrafo nem texto gigante", () => {
  assert.equal(limpaNome("  Ana \n  Paula  "), "Ana Paula");
  assert.equal(limpaNome("x".repeat(200)).length, 60);
});

test("troca so o texto do link e codifica espaco como %20", () => {
  const url = withWhatsAppText("https://wa.me/5562998191314?text=Ol%C3%A1!", "Olá! Sou Ana.");
  assert.equal(url, "https://wa.me/5562998191314?text=Ol%C3%A1!%20Sou%20Ana.");
});

test("preserva outros parametros do link", () => {
  const url = withWhatsAppText("https://api.whatsapp.com/send?phone=5562998191314&text=oi", "Olá");
  assert.equal(url, "https://api.whatsapp.com/send?phone=5562998191314&text=Ol%C3%A1");
});

test("link invalido volta intacto em vez de quebrar a pagina", () => {
  assert.equal(withWhatsAppText("nao-e-url", "Olá"), "nao-e-url");
});

test("toda pergunta tem 4 opcoes com frase pra mensagem", () => {
  for (const passo of [PERGUNTA_LOJA, PERGUNTA_GRUPOS, PERGUNTA_SEGMENTO]) {
    assert.equal(passo.options.length, 4, passo.legend);
    for (const opcao of passo.options) {
      assert.ok(opcao.phrase.length > 0, `${passo.legend} / ${opcao.label} sem frase`);
      // Entra no meio da frase; quem capitaliza o começo é buildLeadMessage.
      assert.equal(opcao.phrase[0], opcao.phrase[0].toLowerCase(), opcao.label);
    }
  }
});
