// apps/web/src/app/api/integracoes/site/route.ts
import { situacoesDosCadastros } from "@/lib/integracoes/situacao-do-cadastro";
import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { lerPainelDoSite } from "@/lib/stores/painel-do-site";
import { integracaoDaLoja } from "@/lib/stores/site-integrations";
import { listTrackedLinks } from "@/lib/stores/tracked-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRINTA_DIAS_MS = 30 * 86_400_000;

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * GET /api/integracoes/site — a tela Configurações › Integrações › Site próprio
 * (spec 2026-10-10-funil-anuncios §3). A chave nunca sai inteira (só os 4
 * últimos) e o telefone sai mascarado: quem vê a lista não vê o número.
 *
 * Além do contrato da spec: `gerada_em` ("Gerada em DD/MM") e `links` (as
 * opções do seletor de destino).
 */
export async function GET(req: Request): Promise<Response> {
  let tenantId: string;
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !hasPermission(ctx.role, "settings:connection")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    tenantId = ctx.tenantId;
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[integracoes/site] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }

  try {
    const desde = new Date(Date.now() - TRINTA_DIAS_MS).toISOString();
    const [integracao, links, painel] = await Promise.all([
      integracaoDaLoja(tenantId),
      listTrackedLinks(tenantId),
      lerPainelDoSite(tenantId, desde),
    ]);
    const link = integracao ? links.find((l) => l.id === integracao.trackedLinkId) : undefined;
    return resposta(
      {
        ativa: integracao !== null,
        key_last4: integracao?.keyLast4 ?? null,
        gerada_em: integracao ? (integracao.rotatedAt ?? integracao.createdAt) : null,
        link: link ? { id: link.id, slug: link.slug } : null,
        last_used_at: integracao?.lastUsedAt ?? null,
        recebidos_30d: painel.recebidos30d,
        ultimos: situacoesDosCadastros(painel),
        links: links.map((l) => ({ id: l.id, slug: l.slug })),
      },
      200,
    );
  } catch (e) {
    console.error(`[integracoes/site] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não foi possível carregar a integração." }, 500);
  }
}
