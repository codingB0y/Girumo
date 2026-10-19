import { z } from "zod";

import { getAdminContext } from "@/lib/admin-guard";
import { blingDisponivel } from "@/lib/bling/deps";
import { respostaDaHomologacao } from "@/lib/bling/homologacao-resposta";
import { sincronizarLoja } from "@/lib/bling/sincronizar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** O teste leva segundos (o Bling aceita até 10 s); a renovação do meio pode esperar o /oauth/token até 15 s. */
const ORCAMENTO_MS = 40_000;
/** O `maxDuration` menos o que a rota gasta antes e depois. */
const VIDA_MS = 55_000;

const corpoSchema = z.strictObject({ tenantId: z.uuid() });

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * POST /api/admin/bling/homologacao — o teste técnico da homologação do app no Bling, com a conexão de uma loja
 * (`/admin/bling`). Só super-admin. Começa depois de "Iniciar" na aba Homologação do app no Bling.
 */
export async function POST(req: Request): Promise<Response> {
  if (!(await getAdminContext())) return resposta({ error: "Não autorizado." }, 401);
  if (!blingDisponivel()) return resposta({ error: "Integração com o Bling indisponível." }, 503);
  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return resposta({ error: "JSON inválido." }, 400);
  }
  const lido = corpoSchema.safeParse(bruto);
  if (!lido.success) return resposta({ error: "Escolha a loja." }, 400);
  try {
    const r = respostaDaHomologacao(await sincronizarLoja(lido.data.tenantId, "homologacao", ORCAMENTO_MS, VIDA_MS));
    return resposta(r.corpo, r.status);
  } catch (e) {
    console.error(`[bling/homologacao] ${lido.data.tenantId}: ${(e as Error).message}`);
    return resposta({ error: "O teste não rodou: erro na Girumo." }, 500);
  }
}
