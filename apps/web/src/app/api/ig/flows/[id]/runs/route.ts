import { requireInstagram } from "@/lib/ig/access";
import { isUuid } from "@/lib/ig/flow/body";
import { traduzErro } from "@/lib/ig/transport/erros";
import { getFlow } from "@/lib/stores/ig-flows";
import { listRuns, type RunRow } from "@/lib/stores/ig-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type Atendimento = {
  id: string;
  username: string | null;
  igUserId: string;
  sourceKind: RunRow["source_kind"];
  matchedKeyword: string | null;
  status: RunRow["status"];
  nodeId: string | null;
  errorCode: string | null;
  /** Já traduzido: a tela não conhece os códigos. */
  errorText: string;
  startedAt: string;
  finishedAt: string | null;
};

const paraTela = (r: RunRow): Atendimento => ({
  id: r.id,
  username: r.username,
  igUserId: r.ig_user_id,
  sourceKind: r.source_kind,
  matchedKeyword: r.matched_keyword,
  status: r.status,
  nodeId: r.node_id,
  errorCode: r.error_code,
  errorText: traduzErro(r.error_code),
  startedAt: r.started_at,
  finishedAt: r.finished_at,
});

// GET /api/ig/flows/[id]/runs — os últimos 50 atendimentos do fluxo. Leitura: qualquer papel da loja.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireInstagram(req);
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    const flow = await getFlow(ctx.tenantId, id);
    if (!flow) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    const runs = await listRuns(ctx.tenantId, id);
    return Response.json({ runs: runs.map(paraTela) });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
