import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { updateTemplate, deleteTemplateById } from "@/lib/stores/template-folders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteProps) {
  const { id } = await params;

  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const patch: { name?: string; body?: string } = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.body === "string" && body.body.trim()) patch.body = body.body.trim();
  if (!patch.name && !patch.body) {
    return Response.json({ error: "informe name e/ou body." }, { status: 400 });
  }

  try {
    return Response.json(await updateTemplate(tenantId, id, patch));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteProps) {
  const { id } = await params;

  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  try {
    const ok = await deleteTemplateById(tenantId, id);
    return Response.json({ ok });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
