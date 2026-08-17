import assert from "node:assert/strict";
import test from "node:test";
import { matchKeyword, normalizeForMatch } from "./match-keyword";

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

test("normaliza caixa, acento e espaço repetido", () => {
  assert.equal(normalizeForMatch("  GRUPO   VIP  "), "grupo vip");
  assert.equal(normalizeForMatch("PREÇO"), "preco");
  assert.equal(normalizeForMatch("Não"), "nao");
  assert.equal(normalizeForMatch("AÇÃO"), "acao");
});

// ---------------------------------------------------------------------------
// Caminho feliz: o que a pessoa escreve de verdade num comentario
// ---------------------------------------------------------------------------

test("casa a palavra independente da caixa", () => {
  assert.equal(matchKeyword("eu quero", ["QUERO"]), "QUERO");
  assert.equal(matchKeyword("EU QUERO", ["quero"]), "quero");
});

test("casa com pontuação e emoji ao redor — é como a pessoa comenta", () => {
  assert.equal(matchKeyword("eu quero!!! 😍", ["quero"]), "quero");
  assert.equal(matchKeyword("😍quero😍", ["quero"]), "quero");
  assert.equal(matchKeyword("quero.", ["quero"]), "quero");
  assert.equal(matchKeyword("(quero)", ["quero"]), "quero");
  assert.equal(matchKeyword("quero\nmuito", ["quero"]), "quero");
});

test("acento não impede o casamento em nenhuma das direções", () => {
  // Lojista configura sem acento, cliente escreve com — e vice-versa.
  assert.equal(matchKeyword("qual o preço?", ["PRECO"]), "PRECO");
  assert.equal(matchKeyword("qual o preco?", ["PREÇO"]), "PREÇO");
});

test("palavra composta casa mesmo com espaço sobrando no meio", () => {
  assert.equal(matchKeyword("quero o GRUPO   VIP agora", ["grupo vip"]), "grupo vip");
  assert.equal(matchKeyword("grupo\tvip", ["grupo vip"]), "grupo vip");
});

test("palavra-chave só de emoji casa", () => {
  assert.equal(matchKeyword("eu quero 🔥", ["🔥"]), "🔥");
});

// ---------------------------------------------------------------------------
// Palavra inteira — o falso positivo mais caro
// ---------------------------------------------------------------------------

test("não casa palavra dentro de outra palavra", () => {
  // Se casasse, quem comentasse "querosene" receberia o link do grupo VIP.
  assert.equal(matchKeyword("comprei querosene", ["quero"]), null);
  assert.equal(matchKeyword("aquerode", ["quero"]), null);
  assert.equal(matchKeyword("vipe", ["vip"]), null);
  assert.equal(matchKeyword("xvip", ["vip"]), null);
});

test("número não casa dentro de número maior", () => {
  assert.equal(matchKeyword("rua 444", ["44"]), null);
  assert.equal(matchKeyword("bras 44", ["44"]), "44");
});

test("hífen conta como fronteira de palavra", () => {
  assert.equal(matchKeyword("quero-muito", ["quero"]), "quero");
});

// ---------------------------------------------------------------------------
// Segurança / robustez — input vem do painel, é hostil por definição
// ---------------------------------------------------------------------------

test("palavra-chave vazia NUNCA casa (senão responderia a tudo)", () => {
  // O lojista adiciona um chip em branco por acidente. Se isso casasse com
  // qualquer texto, todo comentário do post viraria DM.
  assert.equal(matchKeyword("qualquer coisa", [""]), null);
  assert.equal(matchKeyword("qualquer coisa", ["   "]), null);
  assert.equal(matchKeyword("qualquer coisa", ["\t\n"]), null);
});

test("metacaractere de regex é tratado como texto literal", () => {
  // ".*" não pode virar curinga, e "a(" não pode estourar o RegExp.
  assert.equal(matchKeyword("qualquer coisa", [".*"]), null);
  assert.equal(matchKeyword("qualquer coisa", ["a("]), null);
  assert.equal(matchKeyword("qualquer coisa", ["[a-z]+"]), null);
  assert.equal(matchKeyword("preço .* barato", [".*"]), ".*");
  assert.doesNotThrow(() => matchKeyword("texto", ["(((", "\\", "+", "?"]));
});

test("texto ou lista vazios devolvem null", () => {
  assert.equal(matchKeyword("", ["quero"]), null);
  assert.equal(matchKeyword("   ", ["quero"]), null);
  assert.equal(matchKeyword("eu quero", []), null);
});

// ---------------------------------------------------------------------------
// Precedência — determinismo importa: o mesmo comentário sempre casa igual
// ---------------------------------------------------------------------------

test("entre várias que casam, a mais específica ganha", () => {
  const keywords = ["quero", "grupo vip"];
  assert.equal(matchKeyword("quero o grupo vip", keywords), "grupo vip");
  // E o resultado não depende da ordem em que o lojista digitou os chips.
  assert.equal(matchKeyword("quero o grupo vip", [...keywords].reverse()), "grupo vip");
});

test("devolve a palavra-chave ORIGINAL, não a normalizada", () => {
  // O painel mostra ao lojista o chip que ele configurou, com acento e caixa.
  assert.equal(matchKeyword("qual o preco", ["PREÇO"]), "PREÇO");
});
