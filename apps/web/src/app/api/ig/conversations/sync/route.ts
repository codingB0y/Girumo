import { carregarConta, requireConversas, responderErroConversa, zernioDaLoja } from "@/lib/ig/conversas/http";
import { varrer } from "@/lib/ig/conversas/varredura";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A Zernio chegou a levar 60–207 s por chamada em 08/10; a varredura para sozinha antes do teto (prazoMs) e devolve `parcial`.
export const maxDuration = 60;

const ESPERA_MS = 120_000;

class MuitoCedo extends Error {}

const cedoDemais = (): Response => Response.json({ error: "A lista foi atualizada há pouco. Tente de novo em instantes.", code: "muito_cedo", retryAfter: ESPERA_MS / 1000 }, { status: 429, headers: { "Retry-After": String(ESPERA_MS / 1000) } });

// POST /api/ig/conversations/sync — a varredura da primeira abertura e do botão "Atualizar". No máximo uma por loja a cada 2 minutos.
export async function POST(req: Request) {
  try {
    const ctx = await requireConversas(req);
    const conta = await carregarConta(ctx.tenantId);
    // `maxSeFalhar`: com o Upstash fora do ar o balde em memória conta por instância; o teto não pode virar N×.
    // Portão largo antes de chamar a Zernio (protege a cota dela) e o portão de 1 por 2 min depois da 1ª página (falha dela não gasta o crédito).
    if (await checkRateLimit(`ig-sync-pre:${ctx.tenantId}`, 6, ESPERA_MS, { maxSeFalhar: 1 })) return cedoDemais();
    let barrado = false;
    const resultado = await varrer({
      tenantId: ctx.tenantId,
      conta,
      client: zernioDaLoja(),
      aposPrimeiraPagina: async () => {
        barrado = await checkRateLimit(`ig-sync:${ctx.tenantId}`, 1, ESPERA_MS, { maxSeFalhar: 1 });
        if (barrado) throw new MuitoCedo();
      },
    }).catch((e) => {
      if (barrado && e instanceof MuitoCedo) return null;
      throw e;
    });
    return resultado ? Response.json(resultado) : cedoDemais();
  } catch (e) {
    return responderErroConversa(e);
  }
}
