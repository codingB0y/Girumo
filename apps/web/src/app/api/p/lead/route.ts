import {
  bumpLpCounter,
  getPublishedPageBySlug,
  insertLpLead,
  insertLpTrackingEvent,
} from "@/lib/pages/store";
import { noticeTextFor, normalizeWhatsappBR, resolveTargetUrl } from "@/lib/pages/schema";
import { extractAttribution, hashIp, isRateLimited } from "@/lib/pages/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9-]{3,60}$/;

/** Público: captura de lead com consent LGPD. Devolve o destino do grupo. */
export async function POST(req: Request) {
  const ip = hashIp(req) ?? "unknown";
  if (isRateLimited(`lead:${ip}`, 5)) {
    return Response.json({ error: "Muitas tentativas. Aguarde 1 minuto." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug : "";
  if (!SLUG_RE.test(slug)) {
    return Response.json({ error: "Página inválida." }, { status: 400 });
  }

  // Honeypot: campo invisível preenchido = bot. Finge sucesso (sem dica).
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return Response.json({ ok: true, redirect_url: null });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (name.length < 2) {
    return Response.json({ error: "Informe seu nome." }, { status: 400 });
  }

  const whatsapp = normalizeWhatsappBR(typeof body.whatsapp === "string" ? body.whatsapp : "");
  if (!whatsapp) {
    return Response.json(
      { error: "WhatsApp inválido. Use DDD + número, ex.: (62) 99999-9999." },
      { status: 400 },
    );
  }

  // LGPD: sem consent explícito não existe lead
  if (body.consent !== true) {
    return Response.json(
      { error: "Você precisa aceitar entrar no grupo pra continuar." },
      { status: 400 },
    );
  }

  try {
    const page = await getPublishedPageBySlug(slug);
    if (!page) {
      return Response.json({ error: "Página não encontrada." }, { status: 404 });
    }

    const redirectUrl = resolveTargetUrl(page);
    const attribution = extractAttribution(body);

    const { created } = await insertLpLead({
      tenantId: page.tenant_id,
      landingPageId: page.id,
      name,
      whatsapp,
      attribution,
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      ipHash: hashIp(req),
      consentText: noticeTextFor(page.content),
    });

    // Evento + contador só na 1ª captura (reenvio do mesmo zap não infla métrica)
    if (created) {
      await insertLpTrackingEvent({
        tenantId: page.tenant_id,
        landingPageId: page.id,
        eventName: "Lead",
        eventData: attribution as unknown as Record<string, unknown>,
      });
      await bumpLpCounter(page.id, "leads");
    }

    return Response.json({ ok: true, redirect_url: redirectUrl, duplicated: !created });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
