import "server-only";
import { createHash } from "crypto";
import type { LpAttribution } from "@/lib/pages/store";

/**
 * Helpers server-side de tracking das LPs públicas:
 * hash de IP (LGPD — nunca IP puro), filtro de bot e rate-limit in-memory
 * (mesmo padrão do middleware de auth; escalar → Upstash, já anotado lá).
 */

const IP_SALT = process.env.LP_IP_SALT ?? "hubflow-lp-v1";

export function hashIp(req: Request): string | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) return null;
  return createHash("sha256").update(`${ip}:${IP_SALT}`).digest("hex").slice(0, 32);
}

/** Bots e prefetchers de preview de link (WhatsApp/Telegram/Meta inflam PageView). */
const BOT_RE =
  /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slackbot|discordbot|linkedinbot|pinterest|headless|lighthouse|pingdom|uptime/i;

export function isBotUserAgent(ua: string | null): boolean {
  if (!ua) return true;
  return BOT_RE.test(ua);
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** true = estourou o limite. Janela fixa por chave. */
export function isRateLimited(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count++;
  return bucket.count > max;
}

const ATTRIB_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "ttclid",
  "referrer",
] as const;

/** Extrai/sanitiza atribuição de um body arbitrário (trunca, descarta lixo). */
export function extractAttribution(body: Record<string, unknown>): LpAttribution {
  const out = {} as Record<(typeof ATTRIB_KEYS)[number], string | null>;
  for (const key of ATTRIB_KEYS) {
    const raw = body[key];
    out[key] =
      typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 300) : null;
  }
  return out;
}
