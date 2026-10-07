import type { FlowDef, FlowOut } from "@/lib/ig/flow/types";
import { ZernioError, type Transport } from "@/lib/ig/transport/types";

export type RunState = {
  id: string;
  flowId: string;
  ref: string;
  sourceKind: "comment" | "dm" | "story";
  providerAccountId: string;
  /** Só quem veio por comentário: onde vão a resposta pública e a privada. */
  comment: { platformPostId: string; commentId: string } | null;
  /** Só quem veio por direct ou story. Depois de um comentário, só a fase 3 descobre (quando a pessoa responde). */
  conversationId: string | null;
  windowExpiresAt: string;
  /** Directs já enviados neste run: o primeiro depois de comentário é a resposta privada. */
  directsSent: number;
};

export type Resultado = {
  status: "done" | "active" | "failed";
  nodeId: string | null;
  waiting: "reply" | "click" | null;
  errorCode: string | null;
  errorMessage: string | null;
  directsSent: number;
};

export type Deps = {
  transport: Transport;
  link: (slug: string, ref: string) => Promise<string>;
  step: (nodeId: string, out: FlowOut) => Promise<void>;
  now: () => Date;
};

const MAX_VISITAS = 2;
const MAX_ERRO = 200;

type Envio = { ok: true } | { ok: false; code: string; message: string | null };

async function enviar(run: RunState, nodeId: string, texto: string, directsSent: number, transport: Transport): Promise<Envio> {
  const idempotencyKey = `${run.id}:${nodeId}`;
  try {
    if (run.sourceKind === "comment" && directsSent === 0) {
      if (!run.comment) return { ok: false, code: "no_comment", message: null };
      await transport.privateReply({ accountId: run.providerAccountId, platformPostId: run.comment.platformPostId, commentId: run.comment.commentId, message: texto, idempotencyKey });
      return { ok: true };
    }
    if (!run.conversationId) return { ok: false, code: "no_conversation", message: null };
    await transport.sendMessage({ accountId: run.providerAccountId, conversationId: run.conversationId, message: texto, idempotencyKey });
    return { ok: true };
  } catch (e) {
    if (!(e instanceof ZernioError)) throw e;
    // Reenvio da Zernio depois de a privada já ter saído: está enviado.
    if (e.privateReplyConsumed) return { ok: true };
    // Rede, 429, 5xx: quem chama devolve 500 e a Zernio tenta de novo (Idempotency-Key segura).
    if (e.transient) throw e;
    return { ok: false, code: e.code, message: e.message.slice(0, MAX_ERRO) };
  }
}

/**
 * Executa o run a partir do gatilho até parar: terminou, ficou esperando
 * (fase 3) ou falhou. Cada transição grava um passo. Lança o `ZernioError`
 * passageiro em vez de gravar falha.
 */
export async function advance(def: FlowDef, run: RunState, deps: Deps): Promise<Resultado> {
  const nos = new Map(def.nodes.map((n) => [n.id, n]));
  const proximo = (de: string, out: FlowOut) => def.edges.find((e) => e.from === de && e.out === out)?.to ?? null;
  const visitas = new Map<string, number>();
  let directsSent = run.directsSent;
  const falha = (nodeId: string | null, code: string, message: string | null): Resultado => ({ status: "failed", nodeId, waiting: null, errorCode: code, errorMessage: message, directsSent });
  const fim = (nodeId: string | null): Resultado => ({ status: "done", nodeId, waiting: null, errorCode: null, errorMessage: null, directsSent });
  const espera = (nodeId: string, waiting: "reply" | "click"): Resultado => ({ status: "active", nodeId, waiting, errorCode: null, errorMessage: null, directsSent });

  const gatilho = def.nodes.find((n) => n.type === "trigger");
  if (!gatilho || gatilho.type !== "trigger") return falha(null, "no_trigger", null);

  // Resposta pública: ação do gatilho, só para quem comentou. A privada é o que importa; a pública falhar não para o run.
  if (run.sourceKind === "comment" && run.comment && gatilho.publicReply) {
    try {
      await deps.transport.publicReply({ accountId: run.providerAccountId, platformPostId: run.comment.platformPostId, commentId: run.comment.commentId, message: gatilho.publicReply, idempotencyKey: `${run.id}:${gatilho.id}:public` });
    } catch (e) {
      if (!(e instanceof ZernioError)) throw e;
    }
  }

  await deps.step(gatilho.id, "next");
  let atualId = proximo(gatilho.id, "next");
  while (atualId) {
    const no = nos.get(atualId);
    if (!no) return falha(atualId, "missing_node", null);
    const vez = (visitas.get(no.id) ?? 0) + 1;
    visitas.set(no.id, vez);
    if (vez > MAX_VISITAS) return falha(no.id, "cycle", null);
    if (deps.now().getTime() > Date.parse(run.windowExpiresAt)) return falha(no.id, "window_expired", null);
    if (no.type === "trigger") return falha(no.id, "trigger_in_middle", null);
    if (no.type === "condition") return falha(no.id, "unsupported_node", null);

    const texto = no.type === "invite" && no.campaignSlug ? `${no.text}\n${await deps.link(no.campaignSlug, run.ref)}` : no.text;
    const envio = await enviar(run, no.id, texto, directsSent, deps.transport);
    if (!envio.ok) return falha(no.id, envio.code, envio.message);
    directsSent += 1;

    if (no.type === "message" && no.wait) return espera(no.id, "reply");
    if (no.type === "invite") {
      const temDesvio = proximo(no.id, "clicked") !== null || proximo(no.id, "not_clicked") !== null || no.remindAfterMinutes !== null;
      return temDesvio ? espera(no.id, "click") : fim(no.id);
    }
    await deps.step(no.id, "next");
    atualId = proximo(no.id, "next");
    if (!atualId) return fim(no.id);
  }
  return fim(gatilho.id);
}
