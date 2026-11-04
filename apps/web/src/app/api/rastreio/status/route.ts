import { falhou, resposta } from "@/lib/bio/painel-api";
import { lojaDoRastreioNoPainel } from "@/lib/rastreio/rota-painel";
import { rastreioLigado } from "@/lib/stores/rastreio-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Se o módulo está liberado: a única rota que responde também com ele desligado. */
export async function GET(req: Request): Promise<Response> {
  const loja = await lojaDoRastreioNoPainel(req, { exigirLigado: false });
  if (loja instanceof Response) return loja;
  try {
    return resposta({ enabled: await rastreioLigado(loja.tenantId) }, 200);
  } catch (e) {
    return falhou("api/rastreio/status", loja.tenantId, e, "Não deu para ler o estado do Rastreio.");
  }
}
