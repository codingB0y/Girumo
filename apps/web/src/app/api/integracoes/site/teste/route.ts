// apps/web/src/app/api/integracoes/site/teste/route.ts
import { lerCadastro } from "@/lib/integracoes/cadastro-do-site";
import { redirectDoCadastro } from "@/lib/integracoes/redirect-do-cadastro";
import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { getCustomDomain } from "@/lib/stores/custom-domains";
import { integracaoDaLoja } from "@/lib/stores/site-integrations";
import { getTrackedLinkById } from "@/lib/stores/tracked-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nenhum cadastro tem este id, e o /r/ ignora `cid` que não é desta loja (PR 4). */
const CID_DE_TESTE = "00000000-0000-0000-0000-000000000000";

/** O que um site de verdade mandaria (spec §5). */
const CADASTRO_DE_TESTE = {
  whatsapp: "62999998888",
  page_url:
    "https://seusite.com.br/vip?utm_source=ig&utm_medium=paid&utm_campaign=Teste&utm_term=Conjunto&utm_content=Anuncio",
  event_id: "teste-da-girumo",
};

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * POST /api/integracoes/site/teste — "Enviar cadastro de teste".
 *
 * Ensaio, não cadastro: passa um cadastro fixo pelo mesmo parser do endpoint
 * real e monta o redirect com a mesma chave/link/domínio, sem gravar nada. Um
 * cadastro de verdade entraria no funil e sujaria o relatório da loja; marcar
 * "teste" no banco pediria SQL novo nos dois bancos. Que o SERVIDOR do site
 * chama a Girumo continua provado pela linha "Último há N min".
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
    console.error(`[integracoes/site/teste] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }

  try {
    const integracao = await integracaoDaLoja(tenantId);
    if (!integracao) return resposta({ error: "Gere a chave antes de testar." }, 409);

    // Se o parser mudar e passar a recusar a amostra, isto aparece aqui e não na loja.
    const lido = lerCadastro(CADASTRO_DE_TESTE);
    if (!lido.ok) throw new Error(`cadastro de teste recusado pelo parser: ${lido.erro}`);

    const [link, dominio] = await Promise.all([
      getTrackedLinkById(tenantId, integracao.trackedLinkId),
      getCustomDomain(tenantId),
    ]);
    if (!link) return resposta({ error: "O link de destino não existe mais. Gere outra chave escolhendo um link." }, 409);

    const redirect = redirectDoCadastro({
      dominioAtivo: dominio?.status === "active" ? dominio.hostname : null,
      slug: link.slug,
      captureId: CID_DE_TESTE,
    });
    return resposta(
      { gravado: false, enviado: CADASTRO_DE_TESTE, resposta: { status: 201, corpo: { redirect, capture_id: CID_DE_TESTE } } },
      200,
    );
  } catch (e) {
    console.error(`[integracoes/site/teste] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não foi possível testar agora." }, 500);
  }
}
