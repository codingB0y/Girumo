import { falhou, lojaDoPainel, periodoDoRelatorio, resposta, type ErroDoPainelBio } from "@/lib/bio/painel-api";
import { relatorioBio } from "@/lib/stores/bio-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/link-da-bio/relatorio?dias=7|30 — visitas e toques dos últimos N dias contando hoje, em
 * Brasília (spec §7). Agregado no SQL (`bio_relatorio`): nenhuma linha crua passa pelo teto de 1000
 * do PostgREST.
 */
export async function GET(req: Request): Promise<Response> {
  const loja = await lojaDoPainel(req, "ler");
  if (loja instanceof Response) return loja;
  const periodo = periodoDoRelatorio(new URL(req.url).searchParams.get("dias"));
  if (!periodo) return resposta({ error: "Use dias=7 ou dias=30." } satisfies ErroDoPainelBio, 400);
  try {
    return resposta(await relatorioBio(loja.tenantId, periodo.desde, periodo.ate), 200);
  } catch (e) {
    return falhou("api/link-da-bio/relatorio", loja.tenantId, e, "Não deu pra carregar os números.");
  }
}
