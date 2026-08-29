import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { AUTH_PAGES, isAuthPage, isPublicPage, LEGAL_PAGES, PUBLIC_PAGES } from "./public-pages";

test("os documentos legais abrem sem sessao", () => {
  // O estado ate 26/08: GET /termos e GET /privacidade respondiam 307 para o
  // login em producao, porque nao estavam na allowlist do middleware.
  assert.ok(isPublicPage("/termos"), "/termos precisa ser publica");
  assert.ok(isPublicPage("/privacidade"), "/privacidade precisa ser publica");
});

test("a home continua publica", () => {
  assert.ok(isPublicPage("/"));
  assert.ok(isPublicPage("/home-v2"));
});

test("o painel NAO vaza pela allowlist", () => {
  for (const rota of ["/painel", "/painel/campanhas", "/admin", "/admin/quadro"]) {
    assert.equal(isPublicPage(rota), false, `${rota} nao pode ser publica`);
  }
});

test("casa caminho exato, nao prefixo", () => {
  // Prefixo abriria uma familia inteira de rotas por acidente. Numa lista de
  // bypass de autenticacao, essa diferenca e o bug.
  assert.equal(isPublicPage("/termos-internos"), false);
  assert.equal(isPublicPage("/termos/admin"), false);
  assert.equal(isPublicPage("/privacidade-teste"), false);
});

test("os caminhos legais batem com as paginas que existem no disco", () => {
  // Renomear a pasta e esquecer da constante daria 404 numa rota que o rodape e
  // o aceite do cadastro continuam apontando.
  const appRoot = process.cwd();
  for (const rota of Object.values(LEGAL_PAGES)) {
    const arquivo = path.join(appRoot, "src", "app", rota.replace(/^\//, ""), "page.tsx");
    readFileSync(arquivo, "utf8"); // estoura se nao existir
    assert.ok(PUBLIC_PAGES.includes(rota), `${rota} existe no disco mas nao esta na allowlist`);
  }
});

test("o middleware usa a lista em vez de repetir os caminhos", () => {
  // Se alguem voltar a escrever `pathname === "/termos"` no middleware, a lista
  // deixa de ser a fonte unica e este modulo passa a testar algo que nao vale.
  const fonte = readFileSync(path.join(process.cwd(), "src", "middleware.ts"), "utf8");
  assert.match(fonte, /isPublicPage/, "middleware precisa consultar isPublicPage");
});

test("/demo abre sem sessão", () => {
  assert.equal(isPublicPage("/demo"), true);
});

test("prefixo de /demo não abre por acidente", () => {
  // A lista casa por caminho exato. Se algum dia virar prefixo, este teste cai.
  assert.equal(isPublicPage("/demo-interno"), false);
});

test("as telas de autenticacao sao reconhecidas", () => {
  for (const rota of ["/login", "/signup", "/forgot-password", "/reset-password", "/auth/callback"]) {
    assert.ok(isAuthPage(rota), `${rota} precisa ser tela de autenticacao`);
  }
});

test("painel e admin NAO sao telas de autenticacao", () => {
  // O custo do falso positivo aqui e telemetria desligada em silencio na tela
  // onde o lojista passa o dia: erro acontece, relatorio nunca sai, e a
  // ausencia de alerta e lida como "nao ha erros".
  for (const rota of ["/painel", "/painel/campanhas", "/admin", "/admin/quadro", "/"]) {
    assert.equal(isAuthPage(rota), false, `${rota} nao pode contar como tela de autenticacao`);
  }
});

test("isAuthPage casa caminho exato, nao prefixo", () => {
  assert.equal(isAuthPage("/login-interno"), false);
  assert.equal(isAuthPage("/painel/login"), false);
  assert.equal(isAuthPage("/signup-admin"), false);
});

test("as duas listas nao se sobrepoem", () => {
  // Sao conceitos diferentes: PUBLIC_PAGES libera no middleware, AUTH_PAGES so
  // informa o browser. Uma rota nas duas seria sinal de que alguem confundiu.
  for (const rota of AUTH_PAGES) {
    assert.equal(PUBLIC_PAGES.includes(rota), false, `${rota} esta nas duas listas`);
  }
});

test("as telas de autenticacao existem no disco", () => {
  // Renomear a pasta e esquecer da constante deixaria o Sentry carregando numa
  // rota que a lista jura que e leve — e some da rota que passou a existir.
  for (const rota of AUTH_PAGES) {
    const arquivo = path.join(process.cwd(), "src", "app", rota.replace(/^\//, ""), "page.tsx");
    readFileSync(arquivo, "utf8"); // estoura se nao existir
  }
});

test("o coletor de erros consulta a lista em vez de repetir os caminhos", () => {
  // Se alguem voltar a escrever `pathname === "/login"` no instrumentation, a
  // lista deixa de ser fonte unica e estes testes passam a nao valer nada.
  const fonte = readFileSync(path.join(process.cwd(), "src", "instrumentation-client.ts"), "utf8");
  assert.match(fonte, /isAuthPage/, "instrumentation-client precisa consultar isAuthPage");
});
