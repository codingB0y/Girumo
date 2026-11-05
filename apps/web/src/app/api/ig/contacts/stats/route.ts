import { requirePessoas } from "@/lib/ig/access";
import { responderErro } from "@/lib/ig/pessoas-http";
import { contactStats } from "@/lib/stores/ig-contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ig/contacts/stats — os números do topo de Pessoas, contados no banco.
export async function GET(req: Request) {
  try {
    const { ctx } = await requirePessoas(req, "ler");
    return Response.json({ stats: await contactStats(ctx.tenantId) });
  } catch (e) {
    return responderErro(e);
  }
}
