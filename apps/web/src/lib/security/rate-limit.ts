import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Rate limit DISTRIBUÍDO (Upstash Redis) quando configurado; senão cai num Map
// em memória por instância (dev / single-instance). Em serverless multi-réplica
// (Vercel), só o Upstash conta de verdade — o Map zera a cada cold start e não é
// compartilhado entre instâncias, então o teto efetivo vira N× o configurado.
// Ativa sozinho assim que UPSTASH_REDIS_REST_URL + _TOKEN existirem no ambiente.
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
// `retries: 1` porque isto roda no middleware, hot path de toda request: o REST
// do Upstash já é uma ida à rede, e o padrão da lib (5 tentativas com backoff)
// transformaria uma indisponibilidade em segundos de latência antes de degradar.
const redis = url && token ? new Redis({ url, token, retry: { retries: 1 } }) : null;

// Um Ratelimit por par (max, janela) — reusado entre requests.
const limiters = new Map<string, Ratelimit>();

function limiterFor(max: number, windowMs: number): Ratelimit | null {
  if (!redis) return null;
  const key = `${max}:${windowMs}`;
  let rl = limiters.get(key);
  if (!rl) {
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowMs} ms` as Duration),
      prefix: "rl",
    });
    limiters.set(key, rl);
  }
  return rl;
}

// Fallback em memória (mesmo comportamento anterior do middleware).
const memory = new Map<string, { count: number; resetAt: number }>();

/** O mínimo que este módulo usa de um Ratelimit — deixa o teste exercer a queda sem rede. */
export type RateLimiter = { limit(id: string): Promise<{ success: boolean }> };

/**
 * true = bloqueado. Usa Upstash quando configurado; senão janela fixa em memória.
 * `id` deve identificar o balde (ex.: `${ip}:${rota}`).
 */
export async function checkRateLimit(id: string, max: number, windowMs: number): Promise<boolean> {
  return checkRateLimitWith(limiterFor(max, windowMs), id, max, windowMs);
}

/** Núcleo de `checkRateLimit` com o limiter injetado (exportado para os testes). */
export async function checkRateLimitWith(
  limiter: RateLimiter | null,
  id: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  if (limiter) {
    try {
      const { success } = await limiter.limit(id);
      return !success;
    } catch {
      // Upstash fora do ar, timeout ou token expirado: degrada pro balde em
      // memória. Propagar aqui sobe pelo middleware e devolve 500 em TODA
      // request de /api/auth/* e /api/webhooks/evolution — login fora do ar e
      // ingestão parada por causa de uma dependência de rate limit.
    }
  }
  const now = Date.now();
  const entry = memory.get(id);
  if (!entry || now > entry.resetAt) {
    memory.set(id, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > max;
}
