import {
  bumpLpCounter,
  getPublishedPageBySlug,
  insertLpTrackingEvent,
} from "@/lib/pages/store";
import { extractAttribution, hashIp, isBotUserAgent, isRateLimited } from "@/lib/pages/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9-]{3,60}$/;
/** Lead é criado só pelo /api/p/lead (com consent) — aqui só navegação. */
const EVENTS = ["PageView", "GroupJoin"] as const;
type TrackEvent = (typeof EVENTS)[number];

/** Público: beacon de PageView/GroupJoin. Responde 204 sempre que possível
 *  (sendBeacon não lê resposta; bot/limite não merecem dica de erro). */
export async function POST(req: Request) {
  const ua = req.headers.get("user-agent");
  if (isBotUserAgent(ua)) return new Response(null, { status: 204 });

  const ip = hashIp(req) ?? "unknown";
  if (isRateLimited(`track:${ip}`, 30)) return new Response(null, { status: 204 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  const slug = typeof body.slug === "string" ? body.slug : "";
  const event = body.event as TrackEvent;
  if (!SLUG_RE.test(slug) || !EVENTS.includes(event)) {
    return new Response(null, { status: 204 });
  }

  try {
    const page = await getPublishedPageBySlug(slug);
    if (!page) return new Response(null, { status: 204 });

    await insertLpTrackingEvent({
      tenantId: page.tenant_id,
      landingPageId: page.id,
      eventName: event,
      eventData: { ...extractAttribution(body), ua: ua?.slice(0, 200) ?? null },
    });
    if (event === "PageView") await bumpLpCounter(page.id, "views");

    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
}
