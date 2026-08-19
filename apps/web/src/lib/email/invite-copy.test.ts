import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, inviteCopy } from "./invite-copy";

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

test("cai num texto neutro quando o nome de quem convida vem vazio", () => {
  const { quem } = inviteCopy("   ", "Loja");
  assert.equal(quem, "Alguém");
});

test("cai num texto neutro quando a organizacao nao tem nome", () => {
  const { equipe } = inviteCopy("Maria", "");
  assert.equal(equipe, "sua equipe");
});

test("escapa marcacao vinda do banco — este e-mail sai para fora da conta", () => {
  const { quem, equipe } = inviteCopy("<script>alert(1)</script>", '<img src=x onerror="a">');
  assert.doesNotMatch(quem, /<script>/);
  assert.doesNotMatch(equipe, /onerror="/);
  assert.match(quem, /&lt;script&gt;/);
  assert.match(equipe, /&quot;/);
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
