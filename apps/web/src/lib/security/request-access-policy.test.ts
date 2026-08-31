import assert from "node:assert/strict";
import test from "node:test";
import { classifyRequest, decideEngineAccess } from "./request-access-policy";

test("auth POST is public with rate limiting", () => {
  assert.equal(classifyRequest("/api/auth/login", "POST"), "auth-rate-limited");
  assert.equal(classifyRequest("/api/auth/signup", "POST"), "auth-rate-limited");
  assert.equal(classifyRequest("/api/auth/logout", "POST"), "auth-rate-limited");
});

test("closing the social login is rate limited, not session gated", () => {
  assert.equal(classifyRequest("/api/auth/oauth-complete", "POST"), "auth-rate-limited");
});

test("non-POST auth routes stay behind the session gate", () => {
  assert.equal(classifyRequest("/api/auth/me", "GET"), "user");
  assert.equal(classifyRequest("/api/auth/account", "GET"), "user");
  assert.equal(classifyRequest("/api/auth/account", "PATCH"), "user");
  // Regressão: o prefixo devolvia "public" para qualquer método != POST, o que
  // deixava a exclusão de conta fora do gate de sessão.
  assert.equal(classifyRequest("/api/auth/account", "DELETE"), "user");
});

test("bulk group actions are engine-only — sem isso o worker leva 401 para sempre", () => {
  // O middleware so consulta o x-engine-token quando a rota esta nesta lista.
  // Fora dela, a requisicao do worker cai no caminho de sessao e leva
  // "Nao autenticado." — a fila ficaria eternamente em `queued`, e o sintoma
  // (nada drena) apontaria para o worker, nao para o middleware.
  assert.equal(classifyRequest("/api/groups/bulk/pending", "POST"), "engine-only");
  assert.equal(classifyRequest("/api/groups/bulk/ack", "POST"), "engine-only");
});

test("dispatch pending is engine-only", () => {
  assert.equal(classifyRequest("/api/dispatch/pending", "POST"), "engine-only");
});

test("lead reads are shared and ingestion is engine-only", () => {
  assert.equal(classifyRequest("/api/leads", "GET"), "shared");
  assert.equal(classifyRequest("/api/leads", "POST"), "engine-only");
});

test("user mutations on shared resources do not accept engine credentials", () => {
  assert.equal(classifyRequest("/api/leads", "PATCH"), "user");
  assert.equal(classifyRequest("/api/optout", "DELETE"), "user");
  assert.equal(classifyRequest("/api/welcome", "POST"), "user");
  assert.equal(classifyRequest("/api/media", "POST"), "user");
});

test("cron endpoints use handler-level authentication", () => {
  assert.equal(classifyRequest("/api/cron/emails", "GET"), "cron");
  assert.equal(classifyRequest("/api/notifications/alerts", "GET"), "cron");
});

test("every scheduled cron path is on the allowlist", () => {
  // Regressão: /api/cron/group-invites ficou de fora e caía no gate de sessão,
  // que valida JWT do Supabase — o Bearer <CRON_SECRET> do Vercel nunca passa.
  // O cron respondia 401 em toda execução, com o ambiente todo configurado.
  assert.equal(classifyRequest("/api/cron/group-invites", "GET"), "cron");
});

test("the Evolution webhook is session-less and rate limited", () => {
  assert.equal(classifyRequest("/api/webhooks/evolution", "POST"), "webhook");
});

test("the webhook prefix is not open — only the exact provider path is", () => {
  // Qualquer rota criada sob /api/webhooks/ nasce exigindo sessão. Classificar
  // por prefixo abriria todas elas. O caso concreto que motivou isto foi
  // /api/webhooks/config (removida em 20/08); o teste segue com um path
  // genérico para continuar protegendo a PRÓXIMA rota que aparecer ali.
  assert.equal(classifyRequest("/api/webhooks/qualquer-rota-nova", "GET"), "user");
  assert.equal(classifyRequest("/api/webhooks/qualquer-rota-nova", "POST"), "user");
  // Só POST é webhook: um GET no receiver não deve escapar da sessão.
  assert.equal(classifyRequest("/api/webhooks/evolution", "GET"), "user");
  // Sufixos não herdam a isenção.
  assert.equal(classifyRequest("/api/webhooks/evolution/replay", "POST"), "user");
});

test("o beacon de saída entra sem sessão e limitado por IP", () => {
  assert.equal(classifyRequest("/api/track/outbound", "POST"), "public-rate-limited");
  // Prefixo NÃO abre a família: uma rota futura em /api/track/ precisa entrar
  // explicitamente, senão cai no gate de usuário.
  assert.equal(classifyRequest("/api/track/qualquer-outra", "POST"), "user");
});

test("outros métodos no beacon de saída ficam no gate de sessão", () => {
  // Path exato + método exato. GET aqui não tem uso legítimo, e deixar o
  // prefixo largo é como DELETE /api/auth/account nasceu fail-open.
  assert.equal(classifyRequest("/api/track/outbound", "GET"), "user");
});

test("an invalid engine token never falls through to user auth", () => {
  assert.equal(decideEngineAccess("shared", "wrong", "expected"), "reject-401");
});

test("an engine-only method rejects requests without engine credentials", () => {
  assert.equal(decideEngineAccess("engine-only", null, "expected"), "reject-403");
});

test("a valid engine token is accepted and shared routes can continue as user", () => {
  assert.equal(decideEngineAccess("engine-only", "expected", "expected"), "allow-engine");
  assert.equal(decideEngineAccess("shared", null, "expected"), "continue-user");
});

test("ENGINE_TOKEN vazio recusa qualquer token — engine desabilitada e fail-closed", () => {
  // Sem env configurada, nenhuma request da engine autentica. A comparacao em
  // tempo constante (L5) reescreveu esta condicao, entao o comportamento fica
  // travado aqui em vez de depender da forma da expressao.
  //
  // Honestidade sobre o alcance deste teste: apagar so a guarda
  // `expectedToken === ""` NAO o quebra, porque `if (token)` ja garante token
  // nao-vazio e a guarda de comprimento cobre o caso. O que ele trava e o
  // comportamento (ENGINE_TOKEN vazio => 401), nao a forma da expressao.
  assert.equal(decideEngineAccess("engine-only", "qualquer-coisa", ""), "reject-401");
  assert.equal(decideEngineAccess("shared", "qualquer-coisa", ""), "reject-401");
  // Sem token continua sendo o caminho de sempre: 403 na engine-only.
  assert.equal(decideEngineAccess("engine-only", null, ""), "reject-403");
});

test("acertar so um prefixo do token nao passa", () => {
  // O laco XOR roda sobre o comprimento inteiro; a guarda de tamanho vem antes
  // pra nao indexar fora. Token mais curto, mais longo, ou certo so no comeco
  // continua sendo 401 — inclusive quando so o ultimo byte diverge.
  assert.equal(decideEngineAccess("engine-only", "expect", "expected"), "reject-401");
  assert.equal(decideEngineAccess("engine-only", "expectedX", "expected"), "reject-401");
  assert.equal(decideEngineAccess("engine-only", "Expected", "expected"), "reject-401");
  assert.equal(decideEngineAccess("engine-only", "expecteD", "expected"), "reject-401");
});
