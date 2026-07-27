import {
  getPublishedPageBySlug,
  insertLpTrackingEvent,
  isLpRenderContextStaleError,
} from "@/lib/pages/store";
import { deviceFromUserAgent, isCanonicalEvent } from "@/lib/pages/capture";
import { extractAttribution, hashIp, isBotUserAgent, isRateLimited } from "@/lib/pages/analytics";
import {
  isRenderContextStale,
  verifyRenderContextToken,
} from "@/lib/pages/render-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9-]{3,60}$/;
/** id da visita gerado no client (uuid): é o que torna o evento idempotente. */
const VIEW_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Beacon do funil (§5): page_view, form_start, lead_submit_attempt e group_click.
 * `lead_created` NÃO entra aqui — quem o emite é o /api/p/lead, depois de a
 * captura existir de verdade; aceitar esse evento por um beacon público deixaria
 * qualquer um inflar a contagem de leads sem nunca ter preenchido nada.
 *
 * Idempotência: `view_id` + nome do evento fecham o índice uq_lp_events_idem, então
 * StrictMode em dobro, beacon reenviado ou F5 não contam de novo (§5). O `view_id`
 * vem do client porque só ele sabe o que é "a mesma visita" — e o pior caso de um
 * client mentiroso é fabricar visitas, que é o mesmo que ele já podia fazer.
 *
 * Bot/limite continuam 204 sem dica. Contexto inválido/stale recebe 400/409
 * explícito para nunca rotular silenciosamente o evento com outra versão.
 */
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
  const event = typeof body.event === "string" ? body.event : "";
  if (!SLUG_RE.test(slug) || !isCanonicalEvent(event) || event === "lead_created") {
    return new Response(null, { status: 204 });
  }

  const viewId = typeof body.view_id === "string" && VIEW_ID_RE.test(body.view_id)
    ? body.view_id
    : null;

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
        { error: "Esta página mudou. Recarregue antes de continuar." },
        { status: 409 },
      );
    }

    const device = deviceFromUserAgent(ua);
    await insertLpTrackingEvent({
      tenantId: page.tenant_id,
      landingPageId: page.id,
      eventName: event,
      eventData: { ...extractAttribution(body), ua: ua?.slice(0, 200) ?? null },
      idemKey: viewId,
      dimensions: {
        publishedVersion: renderContext.publishedVersion,
        structure: renderContext.structure,
        visualDirection: renderContext.visualDirection,
        modelVersion: renderContext.modelVersion,
        device,
      },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (isLpRenderContextStaleError(error)) {
      return Response.json(
        { error: "Esta página mudou. Recarregue antes de continuar." },
        { status: 409 },
      );
    }
    return new Response(null, { status: 204 });
  }
}
