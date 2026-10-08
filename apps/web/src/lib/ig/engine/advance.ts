import type { FlowDef, FlowNode, FlowOut } from "@/lib/ig/flow/types";
import { ZernioError, type MessageButton, type Transport } from "@/lib/ig/transport/types";

export type RunState = {
  id: string;
  flowId: string;
  ref: string;
  sourceKind: "comment" | "dm" | "story";
  providerAccountId: string;
  /** Só quem veio por comentário: onde vão a resposta pública e a privada. */
  comment: { platformPostId: string; commentId: string } | null;
  /** A conversa do direct. Depois de um comentário, só existe quando a pessoa responde (retomada). */
  conversationId: string | null;
  windowExpiresAt: string;
  /** Directs já enviados neste run: o primeiro depois de comentário é a resposta privada. */
  directsSent: number;
};

export type Resultado = {
  status: "done" | "active" | "failed";
  nodeId: string | null;
  waiting: "reply" | "click" | null;
  /** Até quando a resposta vale. Depois disso, quem responde não avança o run. */
  wakeAt: string | null;
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

/** De onde o run continua quando a pessoa responde: o bloco que esperava e a saída que ela escolheu. */
export type Retomada = { nodeId: string; out: FlowOut };

const MAX_VISITAS = 2;
const MAX_ERRO = 200;

type Envio = { ok: true } | { ok: false; code: string; message: string | null };
type Direct = { texto: string; botao: MessageButton | null };

/** Texto e botão do bloco. Na resposta privada não vai botão: o link volta pro fim do texto. */
async function montarDirect(no: FlowNode, run: RunState, viaPrivada: boolean, deps: Deps): Promise<Direct> {
  if (no.type === "invite") {
    if (!no.campaignSlug) return { texto: no.text, botao: null };
    const url = await deps.link(no.campaignSlug, run.ref);
    if (no.button && !viaPrivada) return { texto: no.text, botao: { type: "url", title: no.button, url } };
    return { texto: `${no.text}\n${url}`, botao: null };
  }
  if (no.type === "message" && no.button && !viaPrivada) return { texto: no.text, botao: { type: "postback", title: no.button, payload: no.id } };
  return { texto: no.type === "message" ? no.text : "", botao: null };
}

async function enviar(run: RunState, nodeId: string, direct: Direct, viaPrivada: boolean, transport: Transport): Promise<Envio> {
  const idempotencyKey = `${run.id}:${nodeId}`;
  try {
    if (viaPrivada) {
      if (!run.comment) return { ok: false, code: "no_comment", message: null };
      await transport.privateReply({ accountId: run.providerAccountId, platformPostId: run.comment.platformPostId, commentId: run.comment.commentId, message: direct.texto, idempotencyKey });
      return { ok: true };
    }
    if (!run.conversationId) return { ok: false, code: "no_conversation", message: null };
    await transport.sendMessage({ accountId: run.providerAccountId, conversationId: run.conversationId, message: direct.texto, ...(direct.botao ? { buttons: [direct.botao] } : {}), idempotencyKey });
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
 * Executa o run até parar: terminou, ficou esperando ou falhou. Sem `retomar`
 * começa no gatilho; com `retomar` continua da saída escolhida pela pessoa
 * (a resposta ao direct que esperava). Cada transição grava um passo. Lança o
 * `ZernioError` passageiro em vez de gravar falha.
 */
export async function advance(def: FlowDef, run: RunState, deps: Deps, retomar?: Retomada): Promise<Resultado> {
  const nos = new Map(def.nodes.map((n) => [n.id, n]));
  const proximo = (de: string, out: FlowOut) => def.edges.find((e) => e.from === de && e.out === out)?.to ?? null;
  const visitas = new Map<string, number>();
  let directsSent = run.directsSent;
  const resultado = (status: Resultado["status"], nodeId: string | null, extra: Partial<Resultado> = {}): Resultado => ({ status, nodeId, waiting: null, wakeAt: null, errorCode: null, errorMessage: null, directsSent, ...extra });
  const falha = (nodeId: string | null, code: string, message: string | null) => resultado("failed", nodeId, { errorCode: code, errorMessage: message });
  const fim = (nodeId: string | null) => resultado("done", nodeId);

  let atualId: string | null;
  if (retomar) {
    await deps.step(retomar.nodeId, retomar.out);
    atualId = proximo(retomar.nodeId, retomar.out);
    if (!atualId) return fim(retomar.nodeId);
  } else {
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
    atualId = proximo(gatilho.id, "next");
    if (!atualId) return fim(gatilho.id);
  }

  while (atualId) {
    const no = nos.get(atualId);
    if (!no) return falha(atualId, "missing_node", null);
    const vez = (visitas.get(no.id) ?? 0) + 1;
    visitas.set(no.id, vez);
    if (vez > MAX_VISITAS) return falha(no.id, "cycle", null);
    if (deps.now().getTime() > Date.parse(run.windowExpiresAt)) return falha(no.id, "window_expired", null);
    if (no.type === "trigger") return falha(no.id, "trigger_in_middle", null);
    if (no.type === "condition") return falha(no.id, "unsupported_node", null);

    const viaPrivada = run.sourceKind === "comment" && directsSent === 0;
    const envio = await enviar(run, no.id, await montarDirect(no, run, viaPrivada, deps), viaPrivada, deps.transport);
    if (!envio.ok) return falha(no.id, envio.code, envio.message);
    directsSent += 1;

    if (no.type === "message" && no.wait) {
      return resultado("active", no.id, { waiting: "reply", wakeAt: new Date(deps.now().getTime() + no.wait.minutes * 60_000).toISOString() });
    }
    if (no.type === "invite") {
      const temDesvio = proximo(no.id, "clicked") !== null || proximo(no.id, "not_clicked") !== null || no.remindAfterMinutes !== null;
      return temDesvio ? resultado("active", no.id, { waiting: "click" }) : fim(no.id);
    }
    await deps.step(no.id, "next");
    const seguinte = proximo(no.id, "next");
    if (!seguinte) return fim(no.id);
    atualId = seguinte;
  }
  return fim(null);
}
