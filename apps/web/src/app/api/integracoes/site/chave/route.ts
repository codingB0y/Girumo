import { z } from "zod";

import { gerarChave } from "@/lib/integracoes/chave-do-site";
import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { salvarChave } from "@/lib/stores/site-integrations";
import { getTrackedLinkById } from "@/lib/stores/tracked-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corpoSchema = z.strictObject({ tracked_link_id: z.uuid() });

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * POST /api/integracoes/site/chave — gera (ou troca) a chave do site próprio.
 * A chave inteira só existe nesta resposta; no banco fica o hash. Gerar outra
 * desliga a anterior na hora (spec 2026-10-10-funil-anuncios §3).
 */
export async function POST(req: Request): Promise<Response> {
  let tenantId: string;
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !hasPermission(ctx.role, "settings:connection")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    tenantId = ctx.tenantId;
  } catch (e) {
    if (e instanceof Response) return e;
    return resposta({ error: "erro" }, 500);
  }

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return resposta({ error: "JSON inválido." }, 400);
  }
  const lido = corpoSchema.safeParse(bruto);
  if (!lido.success) return resposta({ error: "Escolha o link de destino." }, 400);

  try {
    const link = await getTrackedLinkById(tenantId, lido.data.tracked_link_id);
    if (!link) return resposta({ error: "Link não encontrado." }, 404);
    const nova = gerarChave();
    await salvarChave(tenantId, { hash: nova.hash, last4: nova.last4, trackedLinkId: link.id });
    return resposta({ chave: nova.chave, key_last4: nova.last4, link: { id: link.id, slug: link.slug } }, 201);
  } catch (e) {
    console.error(`[integracoes/site/chave] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não foi possível gerar a chave." }, 500);
  }
}
