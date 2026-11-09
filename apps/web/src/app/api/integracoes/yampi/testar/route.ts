import { chaveDeIntegracoes } from "@/lib/security/secret-box";
import { conferirConexao } from "@/lib/yampi/conferir";
import { lojaDoDonoYampi, passouDoTetoYampi, respostaYampi } from "@/lib/yampi/rota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/integracoes/yampi/testar — a conferência do cron, agora: credencial e aviso (religa se caiu). */
export async function POST(req: Request): Promise<Response> {
  const tenantId = await lojaDoDonoYampi(req, "yampi/testar");
  if (tenantId instanceof Response) return tenantId;
  if (!chaveDeIntegracoes()) return respostaYampi({ error: "indisponivel" }, 503);
  const teto = await passouDoTetoYampi(tenantId);
  if (teto) return teto;
  try {
    const r = await conferirConexao(tenantId);
    if (!r) return respostaYampi({ error: "Sem conexão com a Yampi." }, 404);
    return respostaYampi(r, 200);
  } catch (e) {
    console.error(`[yampi/testar] ${tenantId}: ${(e as Error).message}`);
    return respostaYampi({ error: "Não foi possível testar a Yampi." }, 500);
  }
}
