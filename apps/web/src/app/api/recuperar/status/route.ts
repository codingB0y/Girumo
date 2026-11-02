import { contarPrecisaDeVoce } from "@/lib/recuperar/precisa-de-voce";
import { getTenantSettings } from "@/lib/stores/tenant-settings";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/recuperar/status — o que a casca precisa: liberado? quantas conversas esperam resposta?
// Qualquer loja logada pode perguntar (NÃO usa requireRecuperar): sem o add-on a resposta é `enabled: false`.
// Erro de leitura é 500, nunca `enabled: false` — a casca esconderia o módulo de quem pagou.
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    const settings = await getTenantSettings(ctx.tenantId);
    if (!settings.recuperarEnabled) return Response.json({ enabled: false, precisaDeVoce: 0 });
    return Response.json({ enabled: true, precisaDeVoce: await contarPrecisaDeVoce(ctx.tenantId) });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[recuperar/status]", e);
    return Response.json({ error: "Não deu pra ler o Recuperar." }, { status: 500 });
  }
}
