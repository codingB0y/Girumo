import { lerCadastro } from "@/lib/integracoes/cadastro-do-site";
import { chaveDoCabecalho, hashDaChave } from "@/lib/integracoes/chave-do-site";
import { redirectDoCadastro } from "@/lib/integracoes/redirect-do-cadastro";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getCustomDomain } from "@/lib/stores/custom-domains";
import { gravarCadastro } from "@/lib/stores/site-captures";
import { integracaoPelaChave, marcarUso } from "@/lib/stores/site-integrations";
import { getTrackedLinkById } from "@/lib/stores/tracked-links";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CORPO = 8 * 1024;
const TETO_POR_CHAVE = 60;
const JANELA_MS = 60_000;

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * POST /api/integracoes/cadastro — o servidor do site do lojista manda o cadastro
 * e recebe o link do grupo com o `cid` (spec 2026-10-10-funil-anuncios §3).
 *
 * A loja sai da CHAVE, nunca do corpo. O site tem 2 s e cai no link de sempre se
 * isto falhar (spec §5): nenhuma resposta daqui pode prender a pessoa fora do grupo.
 */
export async function POST(req: Request): Promise<Response> {
  if (!USE_SUPABASE) return resposta({ error: "indisponivel" }, 503);

  const chave = chaveDoCabecalho(req.headers.get("authorization"));
  if (!chave) return resposta({ error: "nao_autorizado" }, 401);

  try {
    const integracao = await integracaoPelaChave(hashDaChave(chave));
    if (!integracao) return resposta({ error: "nao_autorizado" }, 401);
    const tenantId = integracao.tenantId;

    // "Último cadastro há N min" na tela de integração. Roda em paralelo com o resto
    // (o site só espera 2 s) e falhar aqui não derruba o cadastro. Todo retorno abaixo
    // passa pelo `finally`, então a promessa nunca fica solta.
    const uso = marcarUso(tenantId).catch((e: unknown) =>
      console.warn(`[integracoes/cadastro] last_used_at de ${tenantId}: ${(e as Error).message}`),
    );

    try {
      if (await checkRateLimit(`site-key:${tenantId}`, TETO_POR_CHAVE, JANELA_MS)) {
        return resposta({ error: "limite" }, 429);
      }

      const texto = await req.text();
      if (texto.length > MAX_CORPO) return resposta({ error: "corpo" }, 413);
      let bruto: unknown;
      try {
        bruto = JSON.parse(texto);
      } catch {
        return resposta({ error: "corpo" }, 400);
      }
      const lido = lerCadastro(bruto);
      if (!lido.ok) return resposta({ error: lido.erro }, lido.erro === "numero" ? 422 : 400);

      const [link, dominio] = await Promise.all([
        getTrackedLinkById(tenantId, integracao.trackedLinkId),
        getCustomDomain(tenantId),
      ]);
      if (!link) return resposta({ error: "link" }, 409);

      const { id, novo } = await gravarCadastro(tenantId, link.id, lido.cadastro);
      const redirect = redirectDoCadastro({
        dominioAtivo: dominio?.status === "active" ? dominio.hostname : null,
        slug: link.slug,
        captureId: id,
      });

      return resposta({ redirect, capture_id: id }, novo ? 201 : 200);
    } finally {
      await uso;
    }
  } catch (e) {
    console.error(`[integracoes/cadastro] falha: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }
}
