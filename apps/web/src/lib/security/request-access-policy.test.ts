import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyRequest,
  decideEngineAccess,
  webhookSkipsIpLimit,
  type AccessKind,
} from "./request-access-policy";

const AQUI = dirname(fileURLToPath(import.meta.url));

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

test("a recontagem diária é engine-only — fora da lista o worker leva 401 para sempre", () => {
  // Mesmo motivo das ações em massa: o middleware só olha o x-engine-token das
  // rotas desta lista; fora dela a recontagem cairia no gate de sessão e o
  // sintoma (contagem que nunca anda) apontaria para o worker.
  assert.equal(classifyRequest("/api/groups/recount", "POST"), "engine-only");
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
  // Preparo e registro do upload direto (uploadMediaFile) — mesmo gate de
  // sessão do upload multipart, sem entrar em ENGINE_ONLY nem em
  // SHARED_PREFIXES (que só cobre GET).
  assert.equal(classifyRequest("/api/media/prepare", "POST"), "user");
  assert.equal(classifyRequest("/api/media/register", "POST"), "user");
});

test("cron endpoints use handler-level authentication", () => {
  assert.equal(classifyRequest("/api/cron/emails", "GET"), "cron");
  assert.equal(classifyRequest("/api/notifications/alerts", "GET"), "cron");
  assert.equal(classifyRequest("/api/cron/bling", "GET"), "cron");
  // Path exato: um sufixo não herda a isenção do gate de sessão.
  assert.equal(classifyRequest("/api/cron/bling/outra", "GET"), "user");
});

test("a path removed from the cron allowlist falls back to the session gate", () => {
  // /api/cron/group-invites foi removido: o backfill de convite virou parte da
  // fila do lote (ver invite-backfill em groups/sync), sem cron diário. O path
  // não pode continuar classificado como "cron" — senão qualquer rota nova sob
  // esse nome herdaria acesso sem sessão por engano.
  assert.equal(classifyRequest("/api/cron/group-invites", "GET"), "user");
});

test("the Evolution webhook is session-less and rate limited", () => {
  assert.equal(classifyRequest("/api/webhooks/evolution", "POST"), "webhook");
});

test("the Zernio webhook is session-less, POST only, exact path only", () => {
  assert.equal(classifyRequest("/api/ig/webhook", "POST"), "webhook");
  assert.equal(classifyRequest("/api/ig/webhook", "GET"), "user");
  assert.equal(classifyRequest("/api/ig/webhook/replay", "POST"), "user");
  // O resto de /api/ig continua exigindo sessão.
  assert.equal(classifyRequest("/api/ig/flows", "POST"), "user");
});

test("Evolution com o secret certo sai do teto por IP — todas as lojas vêm do mesmo IP", () => {
  // O teto de 300/min por IP somava o tráfego de TODAS as lojas (uma stack
  // Evolution, um IP): passou dele, entrada de membro e status de conexão
  // tomavam 429 junto com mensagem descartável.
  assert.equal(webhookSkipsIpLimit("/api/webhooks/evolution", "segredo-certo", "segredo-certo"), true);
});

test("sem provar o secret, o webhook continua no teto por IP", () => {
  const rota = "/api/webhooks/evolution";
  assert.equal(webhookSkipsIpLimit(rota, null, "segredo-certo"), false);
  assert.equal(webhookSkipsIpLimit(rota, "", "segredo-certo"), false);
  assert.equal(webhookSkipsIpLimit(rota, "segredo-errado", "segredo-certo"), false);
  // Prefixo, sufixo ou só o último byte diferente não passam.
  assert.equal(webhookSkipsIpLimit(rota, "segredo", "segredo-certo"), false);
  assert.equal(webhookSkipsIpLimit(rota, "segredo-certoX", "segredo-certo"), false);
  assert.equal(webhookSkipsIpLimit(rota, "segredo-certA", "segredo-certo"), false);
  // Env ausente = fail-closed: nenhum header (nem o vazio) tira do teto.
  assert.equal(webhookSkipsIpLimit(rota, "", ""), false);
  assert.equal(webhookSkipsIpLimit(rota, "qualquer", ""), false);
});

test("o secret da Evolution não tira do teto as outras rotas de webhook", () => {
  // Zernio e Bling se autenticam por HMAC do corpo, que o middleware não lê:
  // continuam no teto por IP mesmo se alguém mandar o header da Evolution.
  assert.equal(webhookSkipsIpLimit("/api/ig/webhook", "segredo-certo", "segredo-certo"), false);
  assert.equal(webhookSkipsIpLimit("/api/integracoes/bling/webhook", "segredo-certo", "segredo-certo"), false);
  assert.equal(webhookSkipsIpLimit("/api/webhooks/evolution/replay", "segredo-certo", "segredo-certo"), false);
});

test("o aviso do Bling entra sem sessão, só no POST e só no path exato", () => {
  assert.equal(classifyRequest("/api/integracoes/bling/webhook", "POST"), "webhook");
  assert.equal(classifyRequest("/api/integracoes/bling/webhook", "GET"), "user");
  assert.equal(classifyRequest("/api/integracoes/bling/webhook/outra", "POST"), "user");
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

test("cadastro do site próprio é público com teto, só no POST e só no path exato", () => {
  assert.equal(classifyRequest("/api/integracoes/cadastro", "POST"), "public-rate-limited");
  assert.equal(classifyRequest("/api/integracoes/cadastro", "GET"), "user");
  assert.equal(classifyRequest("/api/integracoes/cadastro/outra", "POST"), "user");
  assert.equal(classifyRequest("/api/integracoes/site/chave", "POST"), "user");
});

test("retorno do OAuth do Bling entra sem sessão e com teto por IP, só no GET e só no path exato", () => {
  assert.equal(classifyRequest("/api/integracoes/bling/retorno", "GET"), "public-rate-limited");
  assert.equal(classifyRequest("/api/integracoes/bling/retorno", "POST"), "user");
  assert.equal(classifyRequest("/api/integracoes/bling/retorno/outra", "GET"), "user");
  // O resto da família é chamada do painel, com Bearer: continua no gate de sessão.
  assert.equal(classifyRequest("/api/integracoes/bling/conectar", "POST"), "user");
  assert.equal(classifyRequest("/api/integracoes/bling", "DELETE"), "user");
});

// --- Estrutural: rota sem sessão com teto precisa do teto ------------------------------

const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const COM_TETO_NO_MIDDLEWARE: ReadonlySet<AccessKind> = new Set(["public-rate-limited", "webhook"]);

/** Todo literal de path da política: "POST /api/x" (nos Sets e nas chaves) ou "/api/x" (nas comparações). */
function rotasDaPolitica(): Array<{ metodo: string; path: string }> {
  const fonte = readFileSync(join(AQUI, "request-access-policy.ts"), "utf8");
  return [...fonte.matchAll(/"(?:(GET|POST|PUT|PATCH|DELETE) )?(\/api\/[^"\s]*)"/g)].flatMap(([, metodo, path]) =>
    (metodo ? [metodo] : METODOS).map((m) => ({ metodo: m, path })),
  );
}

function chavesDeRateLimit(): Set<string> {
  const fonte = readFileSync(join(AQUI, "..", "..", "middleware.ts"), "utf8");
  const bloco = /const RATE_LIMITS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(fonte)?.[1] ?? "";
  return new Set([...bloco.matchAll(/"(\/api\/[^"]+)"\s*:/g)].map(([, chave]) => chave));
}

test("toda rota pública com teto e todo webhook têm entrada em RATE_LIMITS — sem ela o middleware não limita nada", () => {
  // `isRateLimited` devolve false quando não acha o path: a rota fica sem sessão E sem teto (fail-open).
  const expostas = [
    ...new Set(
      rotasDaPolitica()
        .filter(({ metodo, path }) => COM_TETO_NO_MIDDLEWARE.has(classifyRequest(path, metodo)))
        .map(({ path }) => path),
    ),
  ].sort();
  // Se a leitura da fonte quebrar e não achar nada, o teste passaria vazio: estas têm de aparecer.
  for (const conhecida of ["/api/track/outbound", "/api/webhooks/evolution", "/api/integracoes/bling/webhook"]) {
    assert.ok(expostas.includes(conhecida), `a política deveria expor ${conhecida}`);
  }
  const chaves = chavesDeRateLimit();
  assert.deepEqual(expostas.filter((path) => !chaves.has(path)), [], "rota sem entrada em RATE_LIMITS (middleware.ts)");
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
