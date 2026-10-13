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
  /** Esperou a resposta e o prazo passou: a pessoa não respondeu (o run não fecha sozinho, não há relógio). */
  semResposta: boolean;
};

const paraTela = (r: RunRow, agoraMs: number): Atendimento => ({
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
  semResposta: r.status === "active" && r.waiting === "reply" && r.wake_at !== null && Date.parse(r.wake_at) < agoraMs,
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
    const agoraMs = Date.now();
    return Response.json({ runs: runs.map((r) => paraTela(r, agoraMs)) });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
