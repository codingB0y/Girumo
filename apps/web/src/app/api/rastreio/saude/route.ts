import { falhou, resposta } from "@/lib/bio/painel-api";
import { lojaDoRastreioNoPainel } from "@/lib/rastreio/rota-painel";
import { saudeDoCodigo } from "@/lib/stores/rastreio-entregas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const loja = await lojaDoRastreioNoPainel(req);
  if (loja instanceof Response) return loja;
  try {
    return resposta(await saudeDoCodigo(loja.tenantId, new Date()), 200);
  } catch (e) {
    return falhou("api/rastreio/saude", loja.tenantId, e, "Não deu para ler a saúde do código.");
  }
}
