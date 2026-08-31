export type AccessKind =
  | "public"
  | "public-rate-limited"
  | "auth-rate-limited"
  | "cron"
  | "engine-only"
  | "shared"
  | "webhook"
  | "user";

export type EngineDecision =
  | "allow-engine"
  | "continue-user"
  | "reject-401"
  | "reject-403";

const ENGINE_ONLY = new Set([
  "POST /api/session",
  "POST /api/groups",
  "POST /api/leads",
  "POST /api/activity",
  "POST /api/dispatch/pending",
  "POST /api/dispatch/ack",
  "POST /api/groups/grow/pending",
  "POST /api/groups/grow/ack",
  "POST /api/groups/bulk/pending",
  "POST /api/groups/bulk/ack",
]);

/**
 * Webhooks de provedores externos: sem sessão, autenticados pelo próprio
 * handler (secret constant-time) e com rate limit dedicado no middleware.
 *
 * Casamento por path EXATO, nunca por prefixo: abrir `/api/webhooks/*` exporia
 * sem sessão qualquer outra rota criada sob esse caminho. Foi o caso de
 * `/api/webhooks/config` (rota autenticada de tenant, removida em 20/08 por ser
 * órfã) e vale igual para a próxima que aparecer aqui.
 */
const PROVIDER_WEBHOOKS = new Set(["POST /api/webhooks/evolution"]);

const SHARED_PREFIXES = [
  "/api/session",
  "/api/groups",
  "/api/leads",
  "/api/welcome",
  "/api/optout",
  "/api/media",
];

export function classifyRequest(pathname: string, method: string): AccessKind {
  const normalizedMethod = method.toUpperCase();
  const key = `${normalizedMethod} ${pathname}`;

  // Mutações de auth (login, signup, logout, oauth-complete) entram sem sessão
  // por natureza e são autenticadas pelo próprio handler; o middleware só as
  // limita por IP. Todo o resto de /api/auth/ (GET /me, GET|PATCH|DELETE
  // /account) é rota de usuário logado: cai no gate de sessão como qualquer
  // outra. Antes o prefixo devolvia "public" para qualquer método != POST, o
  // que fazia DELETE /api/auth/account nascer fora do gate — fail-open.
  if (pathname.startsWith("/api/auth/")) {
    return normalizedMethod === "POST" ? "auth-rate-limited" : "user";
  }

  // Rotas de cron: o Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`, que
  // não é JWT do Supabase — cair no gate de sessão devolveria 401 em toda
  // execução. Cada uma autentica o secret no próprio handler.
  //
  // Path EXATO, um por linha: esquecer de listar aqui deixa o cron inerte em
  // produção, com o ambiente todo configurado.
  if (
    pathname === "/api/cron/emails" ||
    pathname === "/api/cron/group-invites" ||
    pathname === "/api/notifications/alerts"
  ) {
    return "cron";
  }

  if (PROVIDER_WEBHOOKS.has(key)) return "webhook";

  if (ENGINE_ONLY.has(key)) return "engine-only";

  if (
    normalizedMethod === "GET" &&
    SHARED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return "shared";
  }

  // Beacon de clique de saída da landing (SEO). Sem sessão por natureza: quem lê
  // a landing ainda não tem conta. O handler devolve 204 sempre e valida o
  // payload contra uma allowlist fechada; o middleware só limita por IP.
  //
  // Path EXATO, igual ao bloco dos crons: `/api/track/` como prefixo abriria
  // qualquer rota futura da família sem gate nenhum.
  if (key === "POST /api/track/outbound") return "public-rate-limited";

  return pathname.startsWith("/api/") ? "user" : "public";
}

/**
 * Compara o token da engine em tempo constante (L5 da auditoria de 06/08).
 *
 * `===` entre strings faz short-circuit no primeiro byte diferente, então o
 * tempo de resposta denunciava quantos bytes iniciais do ENGINE_TOKEN o
 * atacante já tinha acertado — dava pra recuperar o token byte a byte medindo
 * latência.
 *
 * Mesmo laço XOR do `parseSession` em `lib/auth.ts`, e pelo mesmo motivo: isto
 * roda no middleware (Edge), onde `node:crypto` não existe. NÃO troque pelo
 * `timingSafeEqual` de `lib/evolution/webhook-secret.ts` — aquele módulo só
 * carrega porque o receiver declara `runtime = "nodejs"`; aqui derrubaria o
 * middleware inteiro, e com ele todo o worker.
 *
 * ponytail: o comprimento ainda vaza pela guarda de tamanho; fechar isso
 * exigiria digest via `crypto.subtle`, que é async e tornaria
 * `decideEngineAccess` assíncrona no caminho quente do middleware.
 */
function tokenMatches(token: string, expectedToken: string): boolean {
  // Fail-closed: expectedToken vazio = engine desabilitada, nenhum token casa.
  // Redundante hoje: o `if (token)` do chamador ja garante token nao-vazio, e a
  // guarda de comprimento pega o caso. Mantida de proposito por ser o unico
  // ponto onde o invariante fica escrito em vez de inferido — quem um dia
  // afrouxar `if (token)` para `token !== null` perde o fail-closed sem ela.
  if (expectedToken === "" || token.length !== expectedToken.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  }
  return diff === 0;
}

export function decideEngineAccess(
  kind: AccessKind,
  token: string | null,
  expectedToken: string,
): EngineDecision {
  // expectedToken vazio = engine desabilitada: nenhum token é aceito e o
  // request nunca cai no fluxo de usuário carregando um token inválido.
  if (token) {
    return tokenMatches(token, expectedToken) ? "allow-engine" : "reject-401";
  }
  if (kind === "engine-only") return "reject-403";
  return "continue-user";
}
