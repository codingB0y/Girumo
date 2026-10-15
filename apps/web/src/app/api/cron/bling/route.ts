import { avisarReconectar } from "@/lib/bling/avisar-reconectar";
import { blingDisponivel } from "@/lib/bling/deps";
import { sincronizarLoja } from "@/lib/bling/sincronizar";
import { isCronAuthorized } from "@/lib/cron-auth";
import { listarConexoesParaSincronizar } from "@/lib/stores/bling-conexoes";
import { listarReconectarSemAlerta } from "@/lib/stores/bling-conexoes-alertas";

import { executarCron } from "./executar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** As lojas rodam dentro de 270 s (`executar.ts`); o resto é folga para responder. */
export const maxDuration = 300;

/**
 * GET /api/cron/bling — a cada 5 min pelo Vercel Cron (vercel.json), com `Authorization: Bearer
 * <CRON_SECRET>`. Varredura, histórico e fila de cada loja ativa (spec §3), e o e-mail de
 * reconectar que não saiu. Sem as variáveis do Bling a integração está desligada: responde 200 sem
 * nem consultar o banco.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET ?? "")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!blingDisponivel()) return Response.json({ ok: true, pulado: "indisponivel" });
  try {
    const resumo = await executarCron({
      agora: () => Date.now(),
      listar: listarConexoesParaSincronizar,
      sincronizar: sincronizarLoja,
      listarSemAlerta: listarReconectarSemAlerta,
      avisarReconectar: (tenantId) => avisarReconectar(tenantId),
    });
    return Response.json({ ok: true, ...resumo });
  } catch (e) {
    // Só a listagem lança (o motor nunca): banco fora; daqui a 5 min tenta de novo.
    console.error(`[bling/cron] ${e instanceof Error ? e.message : String(e)}`);
    return Response.json({ error: "falhou" }, { status: 500 });
  }
}
