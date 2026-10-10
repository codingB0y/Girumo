import { checkRateLimit } from "@/lib/security/rate-limit";
import { findLeadByPhones, isOptedOutAny } from "@/lib/stores/vendas";
import { MESSAGES, getSalesCaller, handleSalesErrors } from "@/lib/vendas/request";
import { variantesDoTelefone } from "@/lib/vendas/telefone";
import type { BuscaDeContato } from "@/lib/vendas/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Buscas por pessoa por minuto: segura varrer a base da loja chutando números. */
const SEARCHES_PER_MINUTE = 30;

// GET /api/vendas/contato?telefone= — um cliente pelo número, nunca a lista.
// Número em opt-out: não devolve o contato (quem pediu pra sair não reaparece);
// a venda desse número sai sem lead (POST /api/vendas).
export async function GET(req: Request) {
  return handleSalesErrors(async () => {
    const caller = await getSalesCaller(req);
    if (await checkRateLimit(`vendas-busca:${caller.authUserId}`, SEARCHES_PER_MINUTE, 60_000)) {
      return Response.json({ error: MESSAGES.tooManySearches }, { status: 429 });
    }
    const phones = variantesDoTelefone(new URL(req.url).searchParams.get("telefone") ?? "");
    if (!phones) return Response.json({ error: MESSAGES.phone }, { status: 400 });
    if (await isOptedOutAny(caller.tenantId, phones)) {
      return Response.json({ contato: null, optout: true } satisfies BuscaDeContato);
    }
    const lead = await findLeadByPhones(caller.tenantId, phones);
    const result: BuscaDeContato = {
      contato: lead ? { id: lead.id, nome: lead.name, telefone: lead.phone ?? "" } : null,
      optout: false,
    };
    return Response.json(result);
  });
}
