import { z } from "zod";

import { contextoDoGasto, resposta } from "@/lib/resultados/contexto-do-gasto";
import { corpoDoGasto, editarGasto, ERRO_DO_CORPO, excluirGasto } from "@/lib/stores/ad-spend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const ROTA = "api/anuncios/gasto/id";
const idDoLancamento = z.uuid();
const NAO_ACHEI = "Lançamento não encontrado.";

/** PATCH /api/anuncios/gasto/[id] — troca campanha, valor e datas de um lançamento desta loja. */
export async function PATCH(req: Request, { params }: Props): Promise<Response> {
  const ctx = await contextoDoGasto(req, ROTA);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  // Id que não é uuid daria 22P02 no PostgREST (500): para quem chama, é "não existe".
  if (!idDoLancamento.safeParse(id).success) return resposta({ error: NAO_ACHEI }, 404);

  const lido = corpoDoGasto.safeParse(await req.json().catch(() => undefined));
  if (!lido.success) return resposta({ error: ERRO_DO_CORPO }, 400);

  try {
    const editado = await editarGasto(ctx.tenantId, id, lido.data);
    return editado ? resposta(editado, 200) : resposta({ error: NAO_ACHEI }, 404);
  } catch (e) {
    console.error(`[${ROTA}] ${ctx.tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não deu para salvar o gasto." }, 500);
  }
}

/** DELETE /api/anuncios/gasto/[id] — apaga um lançamento desta loja. */
export async function DELETE(req: Request, { params }: Props): Promise<Response> {
  const ctx = await contextoDoGasto(req, ROTA);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!idDoLancamento.safeParse(id).success) return resposta({ error: NAO_ACHEI }, 404);

  try {
    return (await excluirGasto(ctx.tenantId, id)) ? resposta({ ok: true }, 200) : resposta({ error: NAO_ACHEI }, 404);
  } catch (e) {
    console.error(`[${ROTA}] ${ctx.tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não deu para excluir o gasto." }, 500);
  }
}
