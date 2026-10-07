import type { FlowOut } from "@/lib/ig/flow/types";
import { ZernioError, type Transport } from "@/lib/ig/transport/types";
import type { ComentarioRecebido, EventoZernio, MensagemRecebida } from "@/lib/ig/webhook/events";
import type { AccountStatus, IgAccountComLoja } from "@/lib/stores/ig-accounts";
import type { NovoRun, RunPatch, RunRow, SourceKind } from "@/lib/stores/ig-runs";
import { advance, type RunState } from "./advance";
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
  };
  link: (tenantId: string, slug: string, ref: string) => Promise<string>;
};

export type Desfecho =
  | { kind: "ignored"; reason: string }
  | { kind: "account"; tenantId: string }
  | { kind: "retry"; reason: string }
  | { kind: "handled"; tenantId: string; runId: string; status: "done" | "active" | "failed" };

/** 750 por hora é o teto da Meta para resposta privada; paramos antes. */
const TETO_POR_HORA = 700;
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
  if (m.platform !== "instagram" || m.direction !== "incoming" || !m.text) return null;
  const story = ev.metadata?.storyReply !== undefined;
  return {
    origem: story ? { kind: "story", text: m.text } : { kind: "dm", text: m.text },
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

  // ponytail: na fase 3, um direct de quem tem run ativo esperando resposta avança o run em vez de abrir outro.
  const agora = amb.now();
  const entrada = ev.event === "comment.received" ? deComentario(ev, agora.getTime()) : deMensagem(ev, agora.getTime());
  if (!entrada) return { kind: "ignored", reason: "evento sem gatilho" };

  const escolha = escolherFluxo(await amb.fluxosNoAr(tenantId), entrada.origem);
  if (!escolha) return { kind: "ignored", reason: "sem fluxo" };

  // Reenvio primeiro: o run da 1ª tentativa casaria a trava de 24 h e o reenvio seria descartado.
  const existente = await amb.runs.porOrigem(tenantId, entrada.sourceId);
  let run: RunRow | null;
  if (existente) {
    if (existente.status !== "queued") return { kind: "ignored", reason: "duplicado" };
    // Na fila há pouco: a 1ª tentativa pode estar rodando. 500 faz a Zernio tentar de novo depois.
    if (agora.getTime() - Date.parse(existente.started_at) <= RETOMADA_MS) return { kind: "retry", reason: "em andamento" };
    run = existente;
  } else {
    if (await amb.runs.entradaRecente(tenantId, escolha.flowId, entrada.igUserId, iso(agora.getTime() - UM_DIA_MS))) return { kind: "ignored", reason: "24h" };
    if ((await amb.runs.iniciadosDesde(tenantId, conta.id, iso(agora.getTime() - UMA_HORA_MS))) >= TETO_POR_HORA) return { kind: "ignored", reason: "teto" };
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
  const runId = run.id;
  const flowId = run.flow_id;
  try {
    const r = await advance(escolha.def, estado, {
      transport: amb.transport,
      now: amb.now,
      link: (slug, ref) => amb.link(tenantId, slug, ref),
      step: (nodeId, out) => amb.runs.passo(tenantId, { flowId, runId, nodeId, out }),
    });
    await amb.runs.atualizar(tenantId, runId, {
      status: r.status,
      node_id: r.nodeId,
      waiting: r.waiting,
      error_code: r.errorCode,
      error_message: r.errorMessage,
      finished_at: r.status === "active" ? null : agora.toISOString(),
    });
    return { kind: "handled", tenantId, runId, status: r.status };
  } catch (e) {
    // O run fica `queued`: o reenvio da Zernio o retoma depois de 2 min.
    if (e instanceof ZernioError && e.transient) return { kind: "retry", reason: e.code };
    throw e;
  }
}
