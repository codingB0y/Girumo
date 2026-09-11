import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { listLibrary } from "@/lib/stores/template-folders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let tenantId: string;
  try {
    ({ tenantId } = await getRouteTenantContext(req, { allowEngine: false }));
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  try {
    return Response.json(await listLibrary(tenantId));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
