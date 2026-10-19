import { falhou, limiteDaLoja, lojaDoPainel, motivoDoSlug, resposta, type RespostaDoSlug } from "@/lib/bio/painel-api";
import { slugDisponivel } from "@/lib/stores/bio-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/link-da-bio/slug?valor= — o endereço serve para esta loja? (spec §9). `em-uso` inclui slug
 * que já foi de outra loja (slug usado nunca volta para outra, spec §2); o atual ou um antigo desta
 * loja está livre. Sem normalizar: o painel manda o slug já no formato de `SLUG_BIO`.
 */
export async function GET(req: Request): Promise<Response> {
  const loja = await lojaDoPainel(req, "ler");
  if (loja instanceof Response) return loja;
  // O painel consulta enquanto a pessoa digita (com espera); 60 por minuto segura varrer endereços.
  const limitado = await limiteDaLoja("bio-slug", loja.tenantId, 60);
  if (limitado) return limitado;
  const valor = new URL(req.url).searchParams.get("valor") ?? "";
  const ruim = motivoDoSlug(valor);
  if (ruim) return resposta({ disponivel: false, motivo: ruim } satisfies RespostaDoSlug, 200);
  try {
    const corpo: RespostaDoSlug = (await slugDisponivel(valor, loja.tenantId))
      ? { disponivel: true }
      : { disponivel: false, motivo: "em-uso" };
    return resposta(corpo, 200);
  } catch (e) {
    return falhou("api/link-da-bio/slug", loja.tenantId, e, "Não deu pra conferir o endereço.");
  }
}
