import {
  confirmLpCapture,
  getPublishedPageBySlug,
  isLpRenderContextStaleError,
} from "@/lib/pages/store";
import { normalizeWhatsappBR, resolveTargetUrl } from "@/lib/pages/schema";
import { captureIdemKey, deviceFromUserAgent } from "@/lib/pages/capture";
import { extractAttribution, hashIp, isRateLimited } from "@/lib/pages/analytics";
import {
  isRenderContextStale,
  verifyRenderContextToken,
} from "@/lib/pages/render-context";

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
    const renderContextToken =
      typeof body.render_context === "string" ? body.render_context : "";
    const verification = verifyRenderContextToken(renderContextToken, slug);
    if (!verification.ok) {
      return Response.json(
        { error: "Contexto da página inválido. Recarregue e tente novamente." },
        { status: 400 },
      );
    }
    const renderContext = verification.value;

    const page = await getPublishedPageBySlug(slug);
    if (!page || isRenderContextStale(renderContext, page)) {
      return Response.json(
        { error: "Esta página mudou. Recarregue antes de enviar seus dados." },
        { status: 409 },
      );
    }

    const redirectUrl = resolveTargetUrl(page);
    const attribution = extractAttribution(body);
    const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
    const device = deviceFromUserAgent(userAgent);

    // Uma RPC confirma contato, captura, lead legado, evento e contador na mesma
    // transação. Retry reconcilia o conjunto mesmo quando a captura já existia.
    const { created } = await confirmLpCapture({
      tenantId: page.tenant_id,
      landingPageId: page.id,
      name,
      whatsapp,
      publishedVersion: renderContext.publishedVersion,
      campaignSlug: page.campaign_slug,
      structure: renderContext.structure,
      visualDirection: renderContext.visualDirection,
      modelVersion: renderContext.modelVersion,
      noticeVersion: renderContext.noticeVersion,
      noticeText: renderContext.noticeText,
      device,
      attribution,
      idemKey: captureIdemKey(),
      userAgent,
      ipHash: hashIp(req),
    });

    // O destino só existe depois da captura dar certo — nunca antes, e nunca no HTML.
    return Response.json({ ok: true, redirect_url: redirectUrl, duplicated: !created });
  } catch (e) {
    if (isLpRenderContextStaleError(e)) {
      return Response.json(
        { error: "Esta página mudou. Recarregue antes de enviar seus dados." },
        { status: 409 },
      );
    }
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
