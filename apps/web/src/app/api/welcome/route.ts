import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Boas-vindas por DM — DESATIVADA em definitivo.
 *
 * Decisão anti-ban (durável, Igor 2026-07-28): mensagem de lojista só é
 * postada NO GRUPO, nunca no privado. A engine legada (hubflow-engine
 * index.js, welcomeNewMember) ainda consulta esta rota ao ver gente entrando
 * no grupo — respondê-la com enabled:false é o kill switch que não exige
 * redeploy da engine. O substituto oficial é o template "Boas-vindas no
 * grupo" do módulo de automações (trigger lead_entered), executado pelo
 * apps/worker com CHECK @g.us no banco.
 *
 * Nenhuma UI chama mais o POST desta rota (verificado 10/08/2026) — ele
 * retorna 410 pra impedir religar a DM por chamada direta de API.
 */
export async function GET(req: Request) {
  try {
    await getRouteTenantContext(req, { allowEngine: true });
    return Response.json({ enabled: false, message: "" });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao ler boas-vindas." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await getRouteTenantContext(req, { allowEngine: false });
    return Response.json(
      { error: "Boas-vindas por DM foi desativada (anti-ban). Use o template 'Boas-vindas no grupo' em Automações." },
      { status: 410 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro na rota de boas-vindas." }, { status: 500 });
  }
}
