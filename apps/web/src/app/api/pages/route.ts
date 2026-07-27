import { getTenantContext } from "@/lib/supabase/tenant-context";
import { createLandingPage, getLpTemplateById, listLandingPages } from "@/lib/pages/store";
import { parseContentInput, validateTargetGroupUrl } from "@/lib/pages/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    return Response.json(await listLandingPages(ctx.tenantId));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await getTenantContext(req);
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const templateId = typeof body.template_id === "string" ? body.template_id : null;
  if (!templateId) {
    return Response.json({ error: "template_id é obrigatório." }, { status: 400 });
  }

  const parsed = parseContentInput(body.content);
  if (!parsed.ok) {
    return Response.json({ error: "Conteúdo inválido.", details: parsed.errors }, { status: 400 });
  }

  const campaignSlug =
    typeof body.campaign_slug === "string" && body.campaign_slug.trim()
      ? body.campaign_slug.trim()
      : null;
  const targetGroupUrl =
    typeof body.target_group_url === "string" && body.target_group_url.trim()
      ? body.target_group_url.trim()
      : null;

  if (targetGroupUrl && !validateTargetGroupUrl(targetGroupUrl)) {
    return Response.json(
      { error: "target_group_url precisa ser um link https de chat.whatsapp.com ou wa.me." },
      { status: 400 },
    );
  }

  try {
    const template = await getLpTemplateById(templateId);
    if (!template) {
      return Response.json({ error: "Template não encontrado." }, { status: 404 });
    }

    const page = await createLandingPage(ctx.tenantId, {
      template_id: template.id,
      content: parsed.content,
      content_schema_version: parsed.schema_version,
      campaign_slug: campaignSlug,
      target_group_url: targetGroupUrl,
      meta_pixel_id: typeof body.meta_pixel_id === "string" ? body.meta_pixel_id : null,
      ga4_id: typeof body.ga4_id === "string" ? body.ga4_id : null,
    });
    return Response.json(page, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
