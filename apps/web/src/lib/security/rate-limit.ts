import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Rate limit DISTRIBUÍDO (Upstash Redis) quando configurado; senão cai num Map
// em memória por instância (dev / single-instance). Em serverless multi-réplica
// (Vercel), só o Upstash conta de verdade — o Map zera a cada cold start e não é
// compartilhado entre instâncias, então o teto efetivo vira N× o configurado.
// Ativa sozinho assim que UPSTASH_REDIS_REST_URL + _TOKEN existirem no ambiente.
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

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

/**
 * true = bloqueado. Usa Upstash quando configurado; senão janela fixa em memória.
 * `id` deve identificar o balde (ex.: `${ip}:${rota}`).
 */
export async function checkRateLimit(id: string, max: number, windowMs: number): Promise<boolean> {
  const rl = limiterFor(max, windowMs);
  if (rl) {
    const { success } = await rl.limit(id);
    return !success;
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
