import { matchFieldValue } from "@/lib/ig/flow/choices";
import { choiceOut, type FlowDef, type FlowNode, type FlowOut } from "@/lib/ig/flow/types";
import { ZernioError, type ConversationMessageInput, type MessageButton, type QuickReply, type Transport } from "@/lib/ig/transport/types";
import type { Contato } from "./ficha";

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

/**
 * Erro passageiro no direct que espera resposta. Ele pode ter saído mesmo assim
 * (a Zernio segue enviando depois do nosso timeout de 4 s) e a pessoa pode
 * responder antes do reenvio do evento: quem chama deixa o run ouvindo a resposta.
 */
export class EsperaIncerta extends Error {
  constructor(
    readonly causa: ZernioError,
    readonly nodeId: string,
    readonly wakeAt: string,
  ) {
    super(causa.message);
  }
}

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
  /** A ficha da pessoa: o Se… lê, a Etiqueta e o Guardar em gravam. */
  contato: Contato;
  /**
   * Reenvio de um run que já andou: a saída que cada Se… tomou na 1ª tentativa. O Se… reusa essa saída
   * (a etiqueta de agora poderia levar a outro ramo e mandar outra mensagem).
   */
  saidasGravadas?: ReadonlyMap<string, FlowOut>;
  /** Cada mensagem que o robô mandou (id da plataforma; `null` = saiu, mas a Zernio não devolveu id). Só o tipo do bloco, nunca o texto. */
  enviado?: (nodeId: string, messageId: string | null, tipo: string) => void;
};

/**
 * De onde o run continua quando a pessoa responde: o bloco que esperava e a saída que ela escolheu.
 * `guardar` = o que a Pergunta grava na ficha (`saveTo`), antes de seguir.
 */
export type Retomada = { nodeId: string; out: FlowOut; guardar?: { campo: string; valor: string } };

const MAX_VISITAS = 2;
const MAX_ERRO = 200;

/** O que volta em `metadata.postbackPayload` quando a pessoa toca o botão de um direct que espera. */
export const payloadDoBotao = (runId: string, nodeId: string) => `${runId}:${nodeId}`;

type Envio = { ok: true; messageId: string | null } | { ok: false; code: string; message: string | null };
type Direct = { texto: string; botao: MessageButton | null; respostas?: QuickReply[] };

/** Texto e botão do bloco. Na resposta privada não vai botão: o link volta pro fim do texto. */
async function montarDirect(no: FlowNode, run: RunState, viaPrivada: boolean, deps: Deps): Promise<Direct> {
  if (no.type === "invite") {
    if (!no.campaignSlug) return { texto: no.text, botao: null };
    const url = await deps.link(no.campaignSlug, run.ref);
    if (no.button && !viaPrivada) return { texto: no.text, botao: { type: "url", title: no.button, url } };
    return { texto: `${no.text}\n${url}`, botao: null };
  }
  // Escolhas viram respostas rápidas; no 1º direct depois de comentário (privada) valem só digitando.
  if (no.type === "message" && no.choices?.length && !viaPrivada) {
    return { texto: no.text, botao: null, respostas: no.choices.map((title, i) => ({ title, payload: `${run.id}:${no.id}:${i}` })) };
  }
  // O toque só vale onde há quem espere por ele; o payload leva o run pra um botão velho de outro fluxo não liberar este.
  if (no.type === "message" && no.button && no.wait && !viaPrivada) return { texto: no.text, botao: { type: "postback", title: no.button, payload: payloadDoBotao(run.id, no.id) } };
  return { texto: no.type === "message" ? no.text : "", botao: null };
}

async function enviar(run: RunState, nodeId: string, direct: Direct, viaPrivada: boolean, transport: Transport): Promise<Envio> {
  const idempotencyKey = `${run.id}:${nodeId}`;
  try {
    if (viaPrivada) {
      if (!run.comment) return { ok: false, code: "no_comment", message: null };
      const feito = await transport.privateReply({ accountId: run.providerAccountId, platformPostId: run.comment.platformPostId, commentId: run.comment.commentId, message: direct.texto, idempotencyKey });
      return { ok: true, messageId: feito.messageId };
    }
    if (!run.conversationId) return { ok: false, code: "no_conversation", message: null };
    const conversationId = run.conversationId;
    const mandar = (extra: Partial<ConversationMessageInput>, chave: string) => transport.sendMessage({ accountId: run.providerAccountId, conversationId, message: direct.texto, ...extra, idempotencyKey: chave });
    try {
      return { ok: true, messageId: (await mandar(direct.respostas ? { quickReplies: direct.respostas } : direct.botao ? { buttons: [direct.botao] } : {}, idempotencyKey)).messageId };
    } catch (e) {
      // A Zernio recusou o formato das respostas rápidas (não documentado): manda só o texto; a escolha também vale digitando.
      if (!direct.respostas || !(e instanceof ZernioError) || (e.status !== 400 && e.status !== 422)) throw e;
      return { ok: true, messageId: (await mandar({}, `${idempotencyKey}:texto`)).messageId };
    }
  } catch (e) {
    if (!(e instanceof ZernioError)) throw e;
    // Reenvio da Zernio depois de a privada já ter saído: está enviado.
    if (e.privateReplyConsumed) return { ok: true, messageId: null };
    // Rede, 429, 5xx: quem chama devolve 500 e a Zernio tenta de novo (Idempotency-Key segura).
    if (e.transient) throw e;
    return { ok: false, code: e.code, message: e.message.slice(0, MAX_ERRO) };
  }
}

/** Etiqueta aplica e segue; Se… confere a ficha. `null` = o motor ainda não executa essa conferência (`follows`, `clicked`). */
async function semEnvio(no: Extract<FlowNode, { type: "tag" | "condition" }>, contato: Contato): Promise<FlowOut | null> {
  if (no.type === "tag") {
    await contato.aplicar({ add: no.add, remove: no.remove });
    return "next";
  }
  if (no.check !== "field" && no.check !== "tag") return null;
  const ficha = await contato.ler();
  if (no.check === "tag") return ficha.tags.includes(no.tag ?? "") ? "yes" : "no";
  const i = matchFieldValue(String(ficha.fields[no.field ?? ""] ?? ""), no.values ?? []);
  return i === null ? "other" : choiceOut(i);
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
    // Gravar a resposta é idempotente e não pode perder a resposta se o banco da ficha falhar.
    if (retomar.guardar) await deps.contato.guardar({ set: { [retomar.guardar.campo]: retomar.guardar.valor } });
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
    if (no.type === "trigger") return falha(no.id, "trigger_in_middle", null);
    // Etiqueta e Se… não mandam nada: não gastam direct nem dependem da janela da Meta.
    if (no.type === "tag" || no.type === "condition") {
      const reuso = no.type === "condition" && vez === 1 ? deps.saidasGravadas?.get(no.id) : undefined;
      const out = reuso ?? (await semEnvio(no, deps.contato));
      if (out === null) return falha(no.id, "unsupported_node", null);
      if (!reuso) await deps.step(no.id, out);
      const seguinte = proximo(no.id, out);
      if (!seguinte) return fim(no.id);
      atualId = seguinte;
      continue;
    }
    if (deps.now().getTime() > Date.parse(run.windowExpiresAt)) return falha(no.id, "window_expired", null);

    const viaPrivada = run.sourceKind === "comment" && directsSent === 0;
    let envio: Envio;
    try {
      envio = await enviar(run, no.id, await montarDirect(no, run, viaPrivada, deps), viaPrivada, deps.transport);
    } catch (e) {
      if (e instanceof ZernioError && e.transient && no.type === "message" && no.wait) throw new EsperaIncerta(e, no.id, new Date(deps.now().getTime() + no.wait.minutes * 60_000).toISOString());
      throw e;
    }
    if (!envio.ok) return falha(no.id, envio.code, envio.message);
    directsSent += 1;
    deps.enviado?.(no.id, envio.messageId, no.type);

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
