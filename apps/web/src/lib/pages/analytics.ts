import "server-only";
import { createHash } from "crypto";
import type { LpAttribution } from "@/lib/pages/store";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Helpers server-side de tracking das LPs públicas:
 * hash de IP (LGPD — nunca IP puro), filtro de bot e teto por visitante.
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

/**
 * true = estourou `max` por minuto. Conta no `checkRateLimit` (Upstash quando configurado): o Map
 * que morava aqui contava por instância, então na Vercel o teto virava N× o escrito — e /api/p/*
 * fica fora do matcher do middleware, era o único limite da captura pública. Com `slug`, o balde é
 * por IP E página. `limitar` existe para o teste.
 */
export function isRateLimited(
  rota: "lead" | "track" | "outbound" | "bio-visita" | "bio-toque",
  req: Request,
  max: number,
  slug?: string,
  limitar = checkRateLimit,
): Promise<boolean> {
  const ip = hashIp(req) ?? "unknown";
  return limitar(slug ? `${rota}:${ip}:${slug}` : `${rota}:${ip}`, max, 60_000);
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
