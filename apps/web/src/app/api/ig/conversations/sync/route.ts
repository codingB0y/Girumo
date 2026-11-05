import { carregarConta, requireConversas, responderErroConversa, zernioDaLoja } from "@/lib/ig/conversas/http";
import { varrer } from "@/lib/ig/conversas/varredura";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A Zernio chegou a levar 60–207 s por chamada em 08/10; a varredura para sozinha antes do teto (prazoMs) e devolve `parcial`.
export const maxDuration = 60;

const ESPERA_MS = 120_000;

// POST /api/ig/conversations/sync — a varredura da primeira abertura e do botão "Atualizar". No máximo uma por loja a cada 2 minutos.
export async function POST(req: Request) {
  try {
    const ctx = await requireConversas(req);
    const conta = await carregarConta(ctx.tenantId);
    if (await checkRateLimit(`ig-sync:${ctx.tenantId}`, 1, ESPERA_MS)) {
      return Response.json({ error: "A lista foi atualizada há pouco. Tente de novo em instantes.", code: "muito_cedo", retryAfter: ESPERA_MS / 1000 }, { status: 429, headers: { "Retry-After": String(ESPERA_MS / 1000) } });
    }
    const resultado = await varrer({ tenantId: ctx.tenantId, conta, client: zernioDaLoja() });
    return Response.json(resultado);
  } catch (e) {
    return responderErroConversa(e);
  }
}
