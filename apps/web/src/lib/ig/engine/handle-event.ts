import type { FlowOut, MessageNode } from "@/lib/ig/flow/types";
import { TETO_RUNS_POR_HORA } from "@/lib/ig/limites";
import { matchKeyword } from "@/lib/ig/match-keyword";
import { ZernioError, type Transport } from "@/lib/ig/transport/types";
import type { ComentarioRecebido, EventoZernio, MensagemRecebida } from "@/lib/ig/webhook/events";
import type { AccountStatus, IgAccountComLoja } from "@/lib/stores/ig-accounts";
import type { NovoRun, RunPatch, RunRow, SourceKind } from "@/lib/stores/ig-runs";
import { advance, payloadDoBotao, type Deps, type Resultado, type Retomada, type RunState } from "./advance";
import { escolherFluxo, type FluxoNoAr, type Origem } from "./select-flow";

/** Tudo que o tratamento toca, injetado: a rota liga nas stores de verdade; o teste, em memória. */
export type Ambiente = {
  transport: Transport;
  now: () => Date;
  novoRef: () => string;
  contaPorIdDaZernio: (providerAccountId: string) => Promise<IgAccountComLoja | null>;
  mudarEstadoDaConta: (tenantId: string, status: AccountStatus, lastError: string | null) => Promise<void>;
  lojaLiberada: (tenantId: string) => Promise<boolean>;
  fluxosNoAr: (tenantId: string) => Promise<FluxoNoAr[]>;
  runs: {
    criar: (tenantId: string, novo: NovoRun) => Promise<RunRow | null>;
    porOrigem: (tenantId: string, sourceId: string) => Promise<RunRow | null>;
    atualizar: (tenantId: string, id: string, patch: RunPatch) => Promise<void>;
    passo: (tenantId: string, input: { flowId: string; runId: string; nodeId: string; out: FlowOut }) => Promise<void>;
    iniciadosDesde: (tenantId: string, igAccountId: string, sinceIso: string) => Promise<number>;
    entradaRecente: (tenantId: string, flowId: string, igUserId: string, sinceIso: string) => Promise<boolean>;
    esperando: (tenantId: string, igAccountId: string, igUserId: string, username: string | null, agoraIso: string) => Promise<RunRow | null>;
    reivindicar: (tenantId: string, id: string, nodeId: string, messageId: string) => Promise<boolean>;
    retomadoPor: (tenantId: string, messageId: string) => Promise<RunRow | null>;
    retomarParado: (tenantId: string, id: string, updatedAt: string) => Promise<boolean>;
  };
  link: (tenantId: string, slug: string, ref: string) => Promise<string>;
};

export type Desfecho =
  | { kind: "ignored"; reason: string }
  | { kind: "account"; tenantId: string }
  | { kind: "retry"; reason: string }
  | { kind: "handled"; tenantId: string; runId: string; status: "done" | "active" | "failed" };

const UMA_HORA_MS = 60 * 60_000;
const UM_DIA_MS = 24 * UMA_HORA_MS;
const SETE_DIAS_MS = 7 * UM_DIA_MS;
/** Run na fila há mais que isto pode ser reexecutado por um reenvio (spec §8.3). */
const RETOMADA_MS = 2 * 60_000;

type Entrada = {
  origem: Origem;
  sourceKind: SourceKind;
  sourceId: string;
  igUserId: string;
  username: string | null;
  comment: RunState["comment"];
  conversationId: string | null;
  windowExpiresAt: string;
};

const iso = (ms: number) => new Date(ms).toISOString();

/** Data da Zernio que não parseia vira "agora": nunca uma janela que não fecha. */
const ou = (texto: string, agoraMs: number) => {
  const ms = Date.parse(texto);
  return Number.isFinite(ms) ? ms : agoraMs;
};

function deComentario(ev: ComentarioRecebido, agoraMs: number): Entrada | null {
  const c = ev.comment;
  if (c.platform !== "instagram" || c.author.isOwnAccount || c.isReply) return null;
  return {
    origem: { kind: "comment", postId: c.platformPostId, text: c.text },
    sourceKind: "comment",
    sourceId: c.id,
    igUserId: c.author.id,
    username: c.author.username ?? null,
    comment: { platformPostId: c.platformPostId, commentId: c.id },
    conversationId: null,
    windowExpiresAt: iso(ou(c.createdAt, agoraMs) + SETE_DIAS_MS),
  };
}

function deMensagem(ev: MensagemRecebida, agoraMs: number): Entrada | null {
  const m = ev.message;
  // O toque num botão pode chegar sem texto: ainda é resposta (a retomada lê o payload).
  if (m.platform !== "instagram" || m.direction !== "incoming" || (!m.text && !ev.metadata?.postbackPayload)) return null;
  const texto = m.text ?? "";
  const story = ev.metadata?.storyReply !== undefined;
  return {
    origem: story ? { kind: "story", text: texto } : { kind: "dm", text: texto },
    sourceKind: story ? "story" : "dm",
    sourceId: m.platformMessageId,
    igUserId: m.sender.id,
    username: m.sender.username ?? null,
    comment: null,
    conversationId: ev.conversation.id,
    windowExpiresAt: iso(ou(m.sentAt, agoraMs) + UM_DIA_MS),
  };
}

/**
 * Traduz o evento, acha a loja, escolhe o fluxo, aplica as proteções, grava o
 * run (idempotente por source_id) e executa o primeiro passo na mesma chamada.
 * Nada que não casa deixa rastro no banco.
 */
export async function tratarEvento(ev: EventoZernio, amb: Ambiente): Promise<Desfecho> {
  const conta = await amb.contaPorIdDaZernio(ev.account.accountId);
  if (!conta) return { kind: "ignored", reason: "conta desconhecida" };
  const tenantId = conta.tenant_id;

  if (ev.event === "account.connected") {
    await amb.mudarEstadoDaConta(tenantId, "active", null);
    return { kind: "account", tenantId };
  }
  if (ev.event === "account.disconnected") {
    await amb.mudarEstadoDaConta(tenantId, "expired", ev.account.reason ?? null);
    return { kind: "account", tenantId };
  }
  if (conta.status !== "active") return { kind: "ignored", reason: "conta inativa" };
  if (!(await amb.lojaLiberada(tenantId))) return { kind: "ignored", reason: "loja sem liberação" };

  const agora = amb.now();
  const entrada = ev.event === "comment.received" ? deComentario(ev, agora.getTime()) : deMensagem(ev, agora.getTime());
  if (!entrada) return { kind: "ignored", reason: "evento sem gatilho" };

  const fluxos = await amb.fluxosNoAr(tenantId);
  // Direct de quem tem run esperando resposta avança aquele run em vez de abrir outro.
  if (ev.event === "message.received") {
    const retomado = await retomarSeEsperando(ev, entrada, conta.id, tenantId, fluxos, amb);
    if (retomado) return retomado;
  }

  const escolha = escolherFluxo(fluxos, entrada.origem);
  if (!escolha) return { kind: "ignored", reason: "sem fluxo" };

  // Reenvio primeiro: o run da 1ª tentativa casaria a trava de 24 h e o reenvio seria descartado.
  const existente = await amb.runs.porOrigem(tenantId, entrada.sourceId);
  let run: RunRow | null;
  if (existente) {
    if (existente.status !== "queued") return { kind: "ignored", reason: "duplicado" };
    // Na fila há pouco: a 1ª tentativa pode estar rodando. 500 faz a Zernio tentar de novo depois.
    if (agora.getTime() - Date.parse(existente.started_at) <= RETOMADA_MS) return { kind: "retry", reason: "em andamento" };
    // O fluxo do run saiu do ar (ou outro ganhou a palavra) no meio: não executa um grafo que não é o dele.
    if (existente.flow_id !== escolha.flowId) {
      await amb.runs.atualizar(tenantId, existente.id, { status: "stopped", finished_at: agora.toISOString() });
      return { kind: "ignored", reason: "fluxo mudou" };
    }
    run = existente;
  } else {
    if (await amb.runs.entradaRecente(tenantId, escolha.flowId, entrada.igUserId, iso(agora.getTime() - UM_DIA_MS))) return { kind: "ignored", reason: "24h" };
    if ((await amb.runs.iniciadosDesde(tenantId, conta.id, iso(agora.getTime() - UMA_HORA_MS))) >= TETO_RUNS_POR_HORA) return { kind: "ignored", reason: "teto" };
    run = await amb.runs.criar(tenantId, {
      igAccountId: conta.id,
      flowId: escolha.flowId,
      flowVersion: escolha.version,
      sourceKind: entrada.sourceKind,
      sourceId: entrada.sourceId,
      igUserId: entrada.igUserId,
      username: entrada.username,
      matchedKeyword: escolha.keyword,
      ref: amb.novoRef(),
      windowExpiresAt: entrada.windowExpiresAt,
    });
    // Outra requisição criou o mesmo run agora: o reenvio cai no ramo de cima.
    if (!run) return { kind: "retry", reason: "corrida" };
  }

  const estado: RunState = {
    id: run.id,
    flowId: run.flow_id,
    ref: run.ref,
    sourceKind: run.source_kind,
    providerAccountId: ev.account.accountId,
    comment: entrada.comment,
    conversationId: entrada.conversationId,
    windowExpiresAt: run.window_expires_at ?? entrada.windowExpiresAt,
    directsSent: 0,
  };
  try {
    const r = await advance(escolha.def, estado, depsDoRun(tenantId, run, amb));
    await gravar(tenantId, run.id, r, amb);
    return { kind: "handled", tenantId, runId: run.id, status: r.status };
  } catch (e) {
    // O run fica `queued`: o reenvio da Zernio o retoma depois de 2 min.
    if (e instanceof ZernioError && e.transient) return { kind: "retry", reason: e.code };
    throw e;
  }
}

function depsDoRun(tenantId: string, run: RunRow, amb: Ambiente): Deps {
  return {
    transport: amb.transport,
    now: amb.now,
    link: (slug, ref) => amb.link(tenantId, slug, ref),
    step: (nodeId, out) => amb.runs.passo(tenantId, { flowId: run.flow_id, runId: run.id, nodeId, out }),
  };
}

async function gravar(tenantId: string, runId: string, r: Resultado, amb: Ambiente): Promise<void> {
  await amb.runs.atualizar(tenantId, runId, {
    status: r.status,
    node_id: r.nodeId,
    waiting: r.waiting,
    wake_at: r.wakeAt,
    error_code: r.errorCode,
    error_message: r.errorMessage,
    // Relógio lido no fim: `started_at` é o now() do banco no insert, depois da chegada do evento.
    finished_at: r.status === "active" ? null : amb.now().toISOString(),
  });
}

const parar = (tenantId: string, runId: string, code: string, amb: Ambiente) =>
  amb.runs.atualizar(tenantId, runId, { status: "stopped", waiting: null, error_code: code, finished_at: amb.now().toISOString() });

/** A resposta libera o bloco: toque no botão dele, ou uma das palavras (sem palavras = qualquer resposta). */
function liberou(no: MessageNode & { wait: NonNullable<MessageNode["wait"]> }, runId: string, ev: MensagemRecebida): boolean {
  if (ev.metadata?.postbackPayload === payloadDoBotao(runId, no.id)) return true;
  const palavras = (no.wait.keywords ?? []).filter((k) => k.trim());
  return palavras.length === 0 || matchKeyword(ev.message.text ?? "", palavras) !== null;
}

type Achado = { run: RunRow; reivindicado: boolean } | Desfecho | null;

/**
 * O run que este direct deve retomar. Primeiro o reenvio: um direct que já
 * retomou um run nunca abre outro (nem cai no caminho normal e manda um
 * segundo convite). Depois, o run da pessoa que espera resposta.
 */
async function acharRetomada(entrada: Entrada, igAccountId: string, tenantId: string, amb: Ambiente): Promise<Achado> {
  const agora = amb.now();
  const ja = await amb.runs.retomadoPor(tenantId, entrada.sourceId);
  if (!ja) {
    const run = await amb.runs.esperando(tenantId, igAccountId, entrada.igUserId, entrada.username, agora.toISOString());
    return run ? { run, reivindicado: false } : null;
  }
  // Voltou pra espera depois de um erro passageiro: reivindica de novo, como da primeira vez.
  if (ja.status === "active" && ja.waiting === "reply") return { run: ja, reivindicado: false };
  if (ja.status !== "active" || ja.waiting !== null) return { kind: "ignored", reason: "duplicado" };
  // Retomada sem desfecho gravado: a 1ª tentativa ainda roda, ou a função caiu no meio.
  if (agora.getTime() - Date.parse(ja.updated_at) <= RETOMADA_MS) return { kind: "retry", reason: "em andamento" };
  if (!(await amb.runs.retomarParado(tenantId, ja.id, ja.updated_at))) return { kind: "retry", reason: "corrida" };
  return { run: ja, reivindicado: true };
}

/**
 * Retoma o run que esperava resposta desta pessoa. `null` = não havia o que
 * retomar (ou a resposta não liberou o bloco): o direct segue o caminho normal.
 */
async function retomarSeEsperando(ev: MensagemRecebida, entrada: Entrada, igAccountId: string, tenantId: string, fluxos: readonly FluxoNoAr[], amb: Ambiente): Promise<Desfecho | null> {
  const achado = await acharRetomada(entrada, igAccountId, tenantId, amb);
  if (!achado || "kind" in achado) return achado;
  const { run } = achado;
  if (!run.node_id) return null;
  const nodeId = run.node_id;
  // Fluxo editado e publicado de novo vale, desde que o bloco que esperava continue lá e esperando.
  const def = fluxos.find((f) => f.id === run.flow_id)?.published ?? null;
  const no = def?.nodes.find((n) => n.id === nodeId);
  if (!def || no?.type !== "message" || !no.wait) {
    await parar(tenantId, run.id, "flow_changed", amb);
    return null;
  }
  if (!achado.reivindicado) {
    if (!liberou({ ...no, wait: no.wait }, run.id, ev)) return null;
    if (!(await amb.runs.reivindicar(tenantId, run.id, nodeId, entrada.sourceId))) return { kind: "ignored", reason: "duplicado" };
  }

  const estado: RunState = {
    id: run.id,
    flowId: run.flow_id,
    ref: run.ref,
    sourceKind: run.source_kind,
    providerAccountId: ev.account.accountId,
    comment: null,
    conversationId: ev.conversation.id,
    // A resposta abre a janela de 24 h do direct.
    windowExpiresAt: entrada.windowExpiresAt,
    directsSent: 1,
  };
  const retomada: Retomada = { nodeId, out: "replied" };
  try {
    const r = await advance(def, estado, depsDoRun(tenantId, run, amb), retomada);
    await gravar(tenantId, run.id, r, amb);
    return { kind: "handled", tenantId, runId: run.id, status: r.status };
  } catch (e) {
    // Volta pra espera: o reenvio reivindica de novo e a Idempotency-Key segura o direct repetido.
    await amb.runs.atualizar(tenantId, run.id, { waiting: "reply" });
    if (e instanceof ZernioError && e.transient) return { kind: "retry", reason: e.code };
    throw e;
  }
}
