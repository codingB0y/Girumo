import { getTenantContext } from "@/lib/supabase/tenant-context";
import { listLpTemplates } from "@/lib/pages/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await getTenantContext(req);
    return Response.json(await listLpTemplates());
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
