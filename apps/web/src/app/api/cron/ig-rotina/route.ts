import { isCronAuthorized } from "@/lib/cron-auth";
import { runConversationRoutine } from "@/lib/stores/ig-conversations";
import { purgeContacts } from "@/lib/stores/ig-contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/ig-rotina — de hora em hora pelo Vercel Cron (vercel.json), com `Authorization: Bearer
 * <CRON_SECRET>`. Prazos das Pessoas do Instagram (spec §5.4: 12 meses sem conversa e 30 dias depois de a
 * loja cancelar o add-on) e das Conversas (§7.3: fecha as paradas e apaga o que passou do prazo).
 */
export async function GET(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET ?? "")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const agora = new Date().toISOString();
    const [pessoas, conversas] = await Promise.all([purgeContacts(agora), runConversationRoutine(agora)]);
    return Response.json({ ok: true, pessoas, conversas });
  } catch (e) {
    // Banco fora: a próxima hora tenta de novo. A mensagem fica no log, não na resposta.
    console.error(`[ig-rotina] ${e instanceof Error ? e.message : String(e)}`);
    return Response.json({ error: "falhou" }, { status: 500 });
  }
}
