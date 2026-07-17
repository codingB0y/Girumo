import {
  bumpLpCounter,
  getPublishedPageBySlug,
  insertLpCapture,
  insertLpLead,
  insertLpTrackingEvent,
  upsertLpContact,
} from "@/lib/pages/store";
import { noticeTextFor, normalizeWhatsappBR, resolveTargetUrl } from "@/lib/pages/schema";
import { captureIdemKey, deviceFromUserAgent } from "@/lib/pages/capture";
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

  // Sem checkbox (§8.2): enviar o formulário JÁ É a ação afirmativa — o aviso
  // está visível junto do botão, e é ele que gravamos como prova. Exigir um
  // `consent` do client seria pedir ao próprio client que confirme o que ele já
  // fez ao chamar esta rota; a evidência que vale é o snapshot do texto abaixo.

  try {
    const page = await getPublishedPageBySlug(slug);
    if (!page) {
      return Response.json({ error: "Página não encontrada." }, { status: 404 });
    }

    const redirectUrl = resolveTargetUrl(page);
    const attribution = extractAttribution(body);
    const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
    const noticeText = noticeTextFor(page.content);

    // Contato: uma pessoa por tenant+whatsapp, independente de quantas páginas.
    const contact = await upsertLpContact({
      tenantId: page.tenant_id,
      whatsapp,
      name,
    });

    // Captura: este envio, nesta versão da página, com a prova do que ela leu.
    const { created } = await insertLpCapture({
      tenantId: page.tenant_id,
      landingPageId: page.id,
      contactId: contact.id,
      publishedVersion: page.published_version ?? 0,
      campaignSlug: page.campaign_slug,
      structure: page.structure ?? "conversion",
      visualDirection: page.visual_direction ?? "premium",
      modelVersion: page.model_version ?? 1,
      noticeVersion: page.notice_version ?? "v1",
      noticeText,
      device: deviceFromUserAgent(userAgent),
      attribution,
      idemKey: captureIdemKey(),
    });

    // Lead legado: ainda alimenta a lista "Últimos leads" do painel até a Fase 5.
    await insertLpLead({
      tenantId: page.tenant_id,
      landingPageId: page.id,
      name,
      whatsapp,
      attribution,
      userAgent,
      ipHash: hashIp(req),
      consentText: noticeText,
    });

    // Evento + contador só na 1ª captura do dia (reenvio/F5 não infla métrica).
    if (created) {
      await insertLpTrackingEvent({
        tenantId: page.tenant_id,
        landingPageId: page.id,
        eventName: "lead_created",
        eventData: attribution as unknown as Record<string, unknown>,
        idemKey: `${contact.id}:${captureIdemKey()}`,
        dimensions: {
          publishedVersion: page.published_version ?? 0,
          structure: page.structure ?? "conversion",
          visualDirection: page.visual_direction ?? "premium",
          modelVersion: page.model_version ?? 1,
          device: deviceFromUserAgent(userAgent),
        },
      });
      await bumpLpCounter(page.id, "leads");
    }

    // O destino só existe depois da captura dar certo — nunca antes, e nunca no HTML.
    return Response.json({ ok: true, redirect_url: redirectUrl, duplicated: !created });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
