import { isCronAuthorized } from "@/lib/cron-auth";
import { chaveDeIntegracoes } from "@/lib/security/secret-box";
import { listarConexoesParaConferir } from "@/lib/stores/yampi-conexoes";
import { limparDadosVencidosComuns, listarEventosParados } from "@/lib/stores/yampi-eventos";
import { conferirConexao } from "@/lib/yampi/conferir";
import { executarCronYampi } from "@/lib/yampi/cron";
import { processarEventoYampi } from "@/lib/yampi/processar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** O reprocesso para de começar evento novo em 90 s; o resto é a conferência e a folga para responder. */
export const maxDuration = 120;

/**
 * GET /api/cron/yampi — pelo Vercel Cron (vercel.json) com `Authorization: Bearer <CRON_SECRET>`, em duas agendas:
 * a de 5 min (aviso parado e conferência do aviso na Yampi) e a das 06:00 UTC (limpeza da base), separadas pelo
 * `x-vercel-cron-schedule`. Sem a chave de cifra nada abre: responde 200 sem consultar o banco. A resposta só
 * conta: nunca leva id de loja.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET ?? "")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!chaveDeIntegracoes()) return Response.json({ ok: true, pulado: "indisponivel" });
  const resumo = await executarCronYampi(
    {
      agora: () => Date.now(),
      listarParados: listarEventosParados,
      processar: (id) => processarEventoYampi(id),
      listarParaConferir: listarConexoesParaConferir,
      conferir: conferirConexao,
      limpar: limparDadosVencidosComuns,
    },
    req.headers.get("x-vercel-cron-schedule"),
  );
  return Response.json({ ok: resumo.erros === 0, ...resumo }, { status: resumo.erros === 0 ? 200 : 500 });
}
