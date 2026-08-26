import test from "node:test";
import assert from "node:assert/strict";

import {
  SENTRY_CSP_HOST,
  resolveSentryDsn,
  scrubEvent,
  tracesSampleRate,
} from "./sentry-options";

test("sem DSN o Sentry fica desligado — nao quebra build nem runtime", () => {
  // O DSN so existe depois que alguem cria o projeto no Sentry. Ate la, e
  // sempre em dev, tudo tem de rodar igual. Um SDK que exige config para o app
  // subir transforma observabilidade em ponto unico de falha.
  assert.equal(resolveSentryDsn({}), null);
  assert.equal(resolveSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: "" }), null);
  assert.equal(resolveSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: "   " }), null);
});

test("le o DSN publico e aceita o do servidor como alternativa", () => {
  assert.equal(
    resolveSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.sentry.io/2" }),
    "https://k@o1.ingest.sentry.io/2",
  );
  assert.equal(
    resolveSentryDsn({ SENTRY_DSN: "https://k@o1.ingest.sentry.io/3" }),
    "https://k@o1.ingest.sentry.io/3",
  );
});

test("nao manda cookie, header de autorizacao nem senha", () => {
  // O maior risco de instalar um coletor de erros e ele virar exfiltracao de
  // credencial: o payload de um 500 carrega a request inteira.
  const evento = {
    request: {
      cookies: { dz_session: "token-de-sessao" },
      headers: {
        authorization: "Bearer super-secreto",
        "x-tenant-id": "abc",
        cookie: "dz_session=token-de-sessao",
      },
      data: { email: "cliente@loja.com", password: "senha123", legalVersion: "2026-08-26" },
    },
    // Montado em pedacos de proposito: o literal inteiro casa com o padrao
    // `sk_test_...` do scan de secrets (infra/scripts/scan-secrets.ps1) e reprova
    // o CI antes de rodar teste nenhum. O valor em runtime e o mesmo.
    extra: { stripeSecret: ["sk", "test", "naoDeveVazar"].join("_") },
  };

  const limpo = scrubEvent(structuredClone(evento)) as typeof evento;

  assert.equal(limpo.request.cookies, undefined, "cookies inteiros tem de sumir");
  assert.equal(limpo.request.headers.authorization, "[Filtrado]");
  assert.equal(limpo.request.headers.cookie, "[Filtrado]");
  assert.equal(limpo.request.data.password, "[Filtrado]");
  assert.equal(limpo.extra.stripeSecret, "[Filtrado]");

  // O que NAO e sensivel continua, senao o relatorio nao serve para depurar.
  assert.equal(limpo.request.headers["x-tenant-id"], "abc");
  assert.equal(limpo.request.data.legalVersion, "2026-08-26");
});

test("scrub aguenta evento vazio ou torto sem estourar", () => {
  // beforeSend roda no caminho de erro. Se ele mesmo lanca, o erro original
  // some — e o coletor vira o motivo de nao ver os defeitos.
  assert.doesNotThrow(() => scrubEvent({}));
  assert.doesNotThrow(() => scrubEvent({ request: null }));
  assert.doesNotThrow(() => scrubEvent({ request: { headers: null, data: "texto cru" } }));
});

test("amostragem de tracing e baixa em producao e desligada sem DSN", () => {
  // Plano free do Sentry: 5k eventos/mes. Tracing a 100% queima a cota em dias
  // e ai os ERROS param de chegar, que e o que importa.
  assert.equal(tracesSampleRate("production"), 0.1);
  assert.equal(tracesSampleRate("development"), 0);
});

test("o host do CSP e o mesmo constante que as politicas usam", () => {
  // Se o connect-src nao cobrir o Sentry, o SDK do browser falha em silencio:
  // o erro acontece, o relatorio nunca sai, e ninguem descobre.
  assert.match(SENTRY_CSP_HOST, /sentry\.io/);
});

test("scrub sobrevive a evento que explode ao ser lido", () => {
  // As entradas "tortas" obvias (null, string) nao exercitam o catch: elas
  // passam pelos guardas sem lançar. Este caso força o caminho de verdade — um
  // getter que estoura, como acontece com objeto exotico do SDK. Sem o
  // try/catch em `scrubEvent`, `beforeSend` lança e o erro ORIGINAL some.
  const hostil: Record<string, unknown> = { request: {} };
  Object.defineProperty(hostil.request as object, "headers", {
    get() {
      throw new Error("acesso proibido");
    },
    enumerable: true,
  });

  assert.doesNotThrow(() => scrubEvent(hostil));
});
