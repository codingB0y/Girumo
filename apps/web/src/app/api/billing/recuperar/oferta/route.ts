import { contextoDoRecuperar } from "@/lib/billing/recuperar-contexto";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/billing/recuperar/oferta — o que a tela do Recuperar mostra antes de assinar.
// Só leitura: não cria customer nem cobra. O preço não volta na resposta (o cliente
// usa a constante do módulo); `configurado` diz se a venda está aberta.
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    const c = await contextoDoRecuperar(ctx.tenantId);
    return Response.json({
      bloqueio: c.bloqueio,
      configurado: c.precoId !== null,
      podeCobrar: ctx.role === "owner" || ctx.role === "admin",
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[billing/recuperar/oferta]", e);
    return Response.json({ error: "Não deu pra carregar a oferta." }, { status: 500 });
  }
}
