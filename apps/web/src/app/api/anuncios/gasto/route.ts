import { dayBR } from "@/lib/date-br";
import { contextoDoGasto, resposta } from "@/lib/resultados/contexto-do-gasto";
import { campanhasDisponiveis, type RespostaDoGasto } from "@/lib/resultados/gasto-de-anuncio";
import { MAX_DIAS_ENTRE, somarDias } from "@/lib/resultados/periodo-anuncios";
import { corpoDoGasto, criarGasto, ERRO_DO_CORPO, listarGastos } from "@/lib/stores/ad-spend";
import { relatorioDeAnuncios } from "@/lib/stores/relatorio-de-anuncios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROTA = "api/anuncios/gasto";

/**
 * GET /api/anuncios/gasto — os lançamentos da loja e os nomes de campanha que o
 * diálogo oferece (spec 2026-10-10-funil-anuncios §3–§4). Os nomes saem do próprio
 * `attribution_report` na janela máxima (400 dias): ele agrega no banco, então o
 * teto de 1000 linhas do PostgREST não corta nada, e já apara o nome como o
 * relatório compara.
 */
export async function GET(req: Request): Promise<Response> {
  const ctx = await contextoDoGasto(req, ROTA);
  if (ctx instanceof Response) return ctx;

  const hoje = dayBR(new Date());
  const [lista, relatorio] = await Promise.allSettled([
    listarGastos(ctx.tenantId),
    relatorioDeAnuncios(ctx.tenantId, { de: somarDias(hoje, -MAX_DIAS_ENTRE), ate: hoje }),
  ]);
  if (lista.status === "rejected") {
    console.error(`[${ROTA}] ${ctx.tenantId}: ${(lista.reason as Error).message}`);
    return resposta({ error: "Não deu para carregar os lançamentos de gasto." }, 500);
  }
  // O relatório fora não pode travar editar e excluir: os lançamentos saem, e o
  // seletor fica com os nomes que já têm lançamento até o relatório voltar.
  if (relatorio.status === "rejected") {
    console.error(`[${ROTA}] relatório ${ctx.tenantId}: ${(relatorio.reason as Error).message}`);
  }
  const linhas = relatorio.status === "fulfilled" ? relatorio.value.linhas : [];
  const corpo: RespostaDoGasto = { lancamentos: lista.value, campanhas: campanhasDisponiveis(linhas, lista.value) };
  return resposta(corpo, 200);
}

/** POST /api/anuncios/gasto — lança o gasto de uma campanha num período. */
export async function POST(req: Request): Promise<Response> {
  const ctx = await contextoDoGasto(req, ROTA);
  if (ctx instanceof Response) return ctx;

  const lido = corpoDoGasto.safeParse(await req.json().catch(() => undefined));
  if (!lido.success) return resposta({ error: ERRO_DO_CORPO }, 400);

  try {
    return resposta(await criarGasto(ctx.tenantId, ctx.autor, lido.data), 201);
  } catch (e) {
    console.error(`[${ROTA}] ${ctx.tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não deu para salvar o gasto." }, 500);
  }
}
