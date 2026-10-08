import { cartaoSalvo, contextoDaAssinatura, customerDaLoja } from "@/lib/billing/instagram-contexto";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/billing/instagram/oferta?convite=<token> — o que a página de assinar mostra.
// Só leitura: não cria customer nem cobra. O token nunca volta na resposta.
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    const token = new URL(req.url).searchParams.get("convite")?.slice(0, 100) || null;
    const c = await contextoDaAssinatura(ctx.tenantId, token);
    const customerId = c.bloqueio ? null : await customerDaLoja(ctx.tenantId);
    const cartao = customerId ? await cartaoSalvo(customerId) : null;
    return Response.json({
      bloqueio: c.bloqueio,
      conviteInvalido: c.conviteInvalido,
      cotacao: c.cotacao,
      cartao: cartao ? { brand: cartao.brand, last4: cartao.last4 } : null,
      configurado: c.precos !== null,
      podeCobrar: ctx.role === "owner" || ctx.role === "admin",
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[billing/instagram/oferta]", e);
    return Response.json({ error: "Não deu pra carregar a oferta." }, { status: 500 });
  }
}
