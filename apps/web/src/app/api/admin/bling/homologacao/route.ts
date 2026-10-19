import { getAdminContext } from "@/lib/admin-guard";
import { blingDisponivel } from "@/lib/bling/deps";
import { homologarPeloAdmin } from "@/lib/bling/homologacao-resposta";
import { sincronizarLoja } from "@/lib/bling/sincronizar";
import { lerConexao } from "@/lib/stores/bling-conexoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** O teste leva segundos (o Bling aceita até 10 s); a renovação do meio pode esperar o /oauth/token até 15 s. */
const ORCAMENTO_MS = 40_000;
/** O `maxDuration` menos o que a rota gasta antes e depois. */
const VIDA_MS = 55_000;

/**
 * POST /api/admin/bling/homologacao — o teste técnico da homologação do app no Bling, com a conexão de uma loja
 * (`/admin/bling`). Só super-admin; a regra toda está em `homologarPeloAdmin`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const r = await homologarPeloAdmin(req, {
      admin: getAdminContext,
      disponivel: () => blingDisponivel(),
      sincronizar: (tenantId) => sincronizarLoja(tenantId, "homologacao", ORCAMENTO_MS, VIDA_MS),
      lerConexao,
      agora: () => new Date(),
      log: (linha) => console.info(linha),
    });
    return Response.json(r.corpo, { status: r.status, headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error(`[bling/homologacao] ${(e as Error).message}`);
    return Response.json({ error: "O teste não rodou: erro na Girumo." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
