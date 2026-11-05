import { isCronAuthorized } from "@/lib/cron-auth";
import { purgeContacts } from "@/lib/stores/ig-contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/ig-rotina — de hora em hora pelo Vercel Cron (vercel.json), com `Authorization: Bearer
 * <CRON_SECRET>`. Hoje só os prazos das Pessoas do Instagram (spec §5.4): 12 meses sem conversa e 30 dias
 * depois de a loja cancelar o add-on. O fechamento de conversas entra aqui no plano 2.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET ?? "")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const apagadas = await purgeContacts(new Date().toISOString());
    return Response.json({ ok: true, ...apagadas });
  } catch (e) {
    // Banco fora: a próxima hora tenta de novo. A mensagem fica no log, não na resposta.
    console.error(`[ig-rotina] ${e instanceof Error ? e.message : String(e)}`);
    return Response.json({ error: "falhou" }, { status: 500 });
  }
}
