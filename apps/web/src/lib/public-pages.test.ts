import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  AUTH_PAGES,
  isAuthPage,
  isPublicPage,
  LEGAL_PAGES,
  PUBLIC_PAGES,
  publicPageCaseAlias,
} from "./public-pages";

const LANDINGS_DE_ANUNCIO = ["/automatico", "/44eBras"];

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
  assert.match(fonte, /publicPageCaseAlias/, "middleware precisa consultar publicPageCaseAlias");
});

test("as landings de anuncio abrem sem sessao", () => {
  // Quem chega pelo anuncio nunca teve conta: fora da lista, o gate responde
  // 307 para o login e o clique pago morre ali.
  for (const rota of LANDINGS_DE_ANUNCIO) {
    assert.ok(isPublicPage(rota), `${rota} precisa ser publica`);
  }
});

test("as landings de anuncio existem no disco com a grafia exata da rota", () => {
  // readdirSync, e nao so readFileSync: o disco do Windows nao diferencia
  // maiuscula, entao uma pasta "44ebras" passaria aqui e daria 404 na Vercel.
  const appDir = path.join(process.cwd(), "src", "app");
  const pastas = readdirSync(appDir);
  for (const rota of LANDINGS_DE_ANUNCIO) {
    const pasta = rota.replace(/^\//, "");
    assert.ok(pastas.includes(pasta), `src/app/${pasta} nao existe com essa grafia`);
    readFileSync(path.join(appDir, pasta, "page.tsx"), "utf8"); // estoura se nao existir
  }
});

test("quem digita a rota com outra caixa vai para a pagina, nao para o login", () => {
  // O caso que motivou: "/44eBras" tem maiuscula no meio e quase ninguem digita assim.
  assert.equal(publicPageCaseAlias("/44ebras"), "/44eBras");
  assert.equal(publicPageCaseAlias("/44EBRAS"), "/44eBras");
  assert.equal(publicPageCaseAlias("/Automatico"), "/automatico");
});

test("quem digita a rota com acento tambem vai para a pagina", () => {
  // O nextUrl.pathname chega codificado: "/automático" vira "/autom%C3%A1tico".
  assert.equal(publicPageCaseAlias("/autom%C3%A1tico"), "/automatico");
  assert.equal(publicPageCaseAlias("/Autom%C3%81tico"), "/automatico");
  assert.equal(publicPageCaseAlias("/44eBr%C3%A1s"), "/44eBras");
  // Acento decomposto (a + acento agudo combinante), como alguns teclados mandam.
  assert.equal(publicPageCaseAlias("/automa%CC%81tico"), "/automatico");
  // Se algum dia chegar já decodificado, funciona igual.
  assert.equal(publicPageCaseAlias("/automático"), "/automatico");
});

test("porcentagem malformada nao derruba o middleware", () => {
  // decodeURIComponent lança URIError com isso; o alias responde null e o gate segue.
  assert.equal(publicPageCaseAlias("/%E0%A4%A"), null);
  assert.equal(publicPageCaseAlias("/44eBras%"), null);
  assert.equal(publicPageCaseAlias("/44eBras%2Fx"), null);
});

test("o alias nao redireciona a propria pagina nem rota que nao e publica", () => {
  // A grafia certa devolver null e o que impede o redirect em loop.
  for (const rota of ["/44eBras", "/automatico", "/", "/termos"]) {
    assert.equal(publicPageCaseAlias(rota), null, `${rota} ja e a grafia certa`);
  }
  for (const rota of ["/painel", "/Painel", "/44ebras/x", "/44ebras-teste", "/login"]) {
    assert.equal(publicPageCaseAlias(rota), null, `${rota} nao e pagina publica`);
  }
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
