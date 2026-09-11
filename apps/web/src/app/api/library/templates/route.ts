import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { createTemplateInFolder } from "@/lib/stores/template-folders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
  const folder_id = typeof body.folder_id === "string" ? body.folder_id : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const copyBody = typeof body.body === "string" ? body.body.trim() : "";
  if (!folder_id || !name || !copyBody) {
    return Response.json({ error: "folder_id, name e body são obrigatórios." }, { status: 400 });
  }

  try {
    return Response.json(await createTemplateInFolder(tenantId, { folder_id, name, body: copyBody }), {
      status: 201,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
