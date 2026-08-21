import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, humanizeName, inviteCopy } from "./invite-copy";

test("o assunto diz quem convidou e para qual equipe", () => {
  const { subject } = inviteCopy("Maria da Silva", "Atacado São João");
  assert.match(subject, /Maria/);
  assert.match(subject, /Atacado São João/);
});

test("usa só o primeiro nome de quem convidou", () => {
  const { subject, quem } = inviteCopy("Maria da Silva", "Loja");
  assert.doesNotMatch(subject, /da Silva/);
  assert.equal(quem, "Maria");
});

test("o nome da loja NAO e cortado no espaco", () => {
  const { equipe } = inviteCopy("Maria", "Atacado São João");
  assert.equal(equipe, "Atacado São João");
});

// Metade das organizações em produção tem o e-mail inteiro no campo `name`.
test("e-mail no lugar do nome vira nome legivel", () => {
  const { quem } = inviteCopy("igor@hubflow.com.br", "Loja");
  assert.equal(quem, "Igor");
});

test("separadores do usuario do e-mail viram espaco", () => {
  assert.equal(humanizeName("maria.silva@loja.com"), "Maria silva");
  assert.equal(humanizeName("joao_pedro@loja.com"), "Joao pedro");
});

test("nome de verdade passa intacto pelo humanize", () => {
  assert.equal(humanizeName("Atacado São João"), "Atacado São João");
});

test("quem convida e equipe iguais nao viram 'X convidou para a equipe de X'", () => {
  const { subject, equipe } = inviteCopy("igor@hubflow.com.br", "igor@hubflow.com.br");
  assert.equal(subject, "Igor convidou você para a equipe");
  assert.equal(equipe, null, "equipe nula sinaliza ao template a frase sem 'de X'");
});

test("a comparacao de redundancia ignora caixa", () => {
  const { equipe } = inviteCopy("Maria", "maria");
  assert.equal(equipe, null);
});

test("organizacao sem nome nao inventa 'de X'", () => {
  const { subject, equipe } = inviteCopy("Maria", "   ");
  assert.equal(equipe, null);
  assert.equal(subject, "Maria convidou você para a equipe");
});

test("cai num texto neutro quando o nome de quem convida vem vazio", () => {
  const { quem } = inviteCopy("   ", "Loja");
  assert.equal(quem, "Alguém");
});

test("escapa marcacao vinda do banco — este e-mail sai para fora da conta", () => {
  const { quem, equipe } = inviteCopy("<script>alert(1)</script>", '<img src=x onerror="a">');
  assert.doesNotMatch(quem, /<script>/);
  assert.match(quem, /&lt;script&gt;/);
  assert.ok(equipe && !/onerror="/.test(equipe));
});

test("o assunto NAO escapa — seria '&amp;' literal para o leitor", () => {
  const { subject } = inviteCopy("Ana", "Tecidos & Cia");
  assert.match(subject, /Tecidos & Cia/);
  assert.doesNotMatch(subject, /&amp;/);
});

test("escapeHtml cobre os cinco caracteres perigosos", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("escapa o & antes dos outros — sem isso viraria escape duplo", () => {
  assert.equal(escapeHtml("<a&b>"), "&lt;a&amp;b&gt;");
});

test("nao usa o vocabulario publico aposentado", () => {
  const { subject } = inviteCopy("Maria", "Loja");
  assert.doesNotMatch(subject, /disparos?/i);
});
