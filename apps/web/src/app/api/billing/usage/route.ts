import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTenantLimits } from "@/lib/billing/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/billing/usage
 *
 * Retorna uso atual vs limites do plano.
 * Usado pelo frontend pra mostrar gating contextual.
 */
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    const supabase = getSupabaseAdmin();
    const tenantId = ctx.tenantId;

    const [limits, campaignsRes, contactsRes] = await Promise.all([
      getTenantLimits(tenantId),
      supabase
        .from("campaign_groups")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
    ]);

    // `count ?? 0` sozinho transforma consulta que FALHOU em "zero usado". Isso
    // era inofensivo enquanto tenant sem assinatura tinha teto vazio (a tela nao
    // renderizava nada), mas agora ele recebe o teto do FREE: a resposta viraria
    // "0 de 250 contatos, tudo tranquilo" para quem esta em 249 e ja e barrado
    // com 402 na escrita — porque `assertPlanLimit` confere o erro e conta de
    // verdade. Mostrar folga onde ha bloqueio e pior que mostrar erro.
    if (campaignsRes.error || contactsRes.error) {
      console.error(campaignsRes.error ?? contactsRes.error);
      return NextResponse.json({ error: "Nao foi possivel contar o uso do plano." }, { status: 500 });
    }

    const campaignsCount = campaignsRes.count ?? 0;
    const contactsCount = contactsRes.count ?? 0;

    return NextResponse.json({
      campaigns: { used: campaignsCount, limit: limits.campaigns ?? null },
      contacts: { used: contactsCount, limit: limits.contacts ?? null },
    });
  } catch (error) {
    // getTenantLimits passou a subir 500 quando nao consegue ler a assinatura,
    // em vez de devolver teto vazio (que liberava tudo). Sem este catch a
    // excecao vazaria do handler.
    if (error instanceof Response) return error;
    console.error(error);
    return NextResponse.json({ error: "Nao foi possivel ler o uso do plano." }, { status: 500 });
  }
}
