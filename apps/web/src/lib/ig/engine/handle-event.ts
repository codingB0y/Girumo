import { passarPraLoja, type AtualizarConversa } from "@/lib/ig/conversas/passar-pra-loja";
import { falhaPassageira, gravarEnvios, lerConversa, registrarEnviada, registrarFalha, registrarRecebida, robotPausado, type Conversas, type EnvioDoRobo, type ModoDaSituacao } from "@/lib/ig/conversas/indice";
import type { FlowOut } from "@/lib/ig/flow/types";
import { TETO_RUNS_POR_HORA } from "@/lib/ig/limites";
import { ZernioError, type Transport } from "@/lib/ig/transport/types";
import type { ComentarioRecebido, EventoZernio, MensagemRecebida } from "@/lib/ig/webhook/events";
import type { IgConversationRow } from "@/lib/stores/ig-conversations";
import type { AccountStatus, IgAccountComLoja } from "@/lib/stores/ig-accounts";
import type { NovoRun, RunPatch, RunRow, SourceKind } from "@/lib/stores/ig-runs";
import { advance, EsperaIncerta, type Deps, type Resultado, type RunState } from "./advance";
import { contatoDaPessoa, registrarFalhaDaFicha, type Contato, type Contatos, type Ficha } from "./ficha";
import { decidirRetomada, saidaDeReserva } from "./resposta";
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
    passos: (tenantId: string, runId: string) => Promise<Array<{ node_id: string; out: string }>>;
    retomadoPor: (tenantId: string, messageId: string) => Promise<RunRow | null>;
    retomarParado: (tenantId: string, id: string, updatedAt: string) => Promise<boolean>;
  };
  link: (tenantId: string, slug: string, ref: string) => Promise<string>;
  /** A ficha da pessoa (`ig_contacts`). */
  contatos: Contatos;
  /** O índice das Conversas (`ig_conversations`) e seus eventos. */
  conversas: Conversas;
  /** `updateConversation` da store: o bloco Passar pra loja põe a conversa em Aguardando você e pausa o robô. */
  atualizarConversa: AtualizarConversa;
  /** Quanto o ack espera a gravação da ficha (padrão 1,5 s: a Zernio reenvia depois de 5 s). */
  tetoDaFichaMs?: number;
};

export type Desfecho =
  | { kind: "ignored"; reason: string }
  | { kind: "account"; tenantId: string }
  | { kind: "retry"; reason: string }
  | { kind: "handled"; tenantId: string; runId: string; status: "done" | "active" | "failed" };

const TETO_FICHA_MS = 1_500;
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

/** O que um evento deixa pelo caminho: gravações em andamento, o que o robô mandou e a conversa da pessoa. */
type Contexto = {
  /** Gravações (ficha, índice) em paralelo com o motor; o ack só sai depois delas (as promessas nunca rejeitam). */
  pendentes: Promise<unknown>[];
  envios: EnvioDoRobo[];
  /** Preenchido depois dos portões (conta ativa, loja liberada): sem ele o evento não toca o índice. */
  tenantId: string | null;
  igAccountId: string;
  pausado: boolean;
  /** Só no comentário: a conversa já conhecida da pessoa, onde a resposta privada deixa o evento. */
  conversaDoComentario: IgConversationRow | null;
  /** O run terminou num Passar pra loja: depois do índice, a conversa vai para Aguardando você e o robô pausa. */
  handoff: { igUserId: string; runId: string } | null;
};

/**
 * Todo direct chega ao índice, inclusive o que o robô não conseguiu tratar (retry, exceção: Aguardando você) e a
 * reentrega (`manter`: não rebaixa uma Aberta). O id da mensagem evita somar a mesma não lida duas vezes.
 */
function modoDaSituacao(d: Desfecho): ModoDaSituacao {
  if (d.kind === "retry") return "waiting";
  return d.kind === "ignored" && (d.reason === "duplicado" || d.reason === "fluxo mudou") ? "manter" : "auto";
}

function registrarNoIndice(ev: EventoZernio, d: Desfecho, ctx: Contexto, amb: Ambiente): void {
  const { tenantId } = ctx;
  if (!tenantId) return;
  const agora = amb.now();
  const { handoff } = ctx;
  // Depois da gravação do índice (que cria a conversa e decide a situação): o Passar pra loja tem a última palavra.
  const depois = (gravando: Promise<unknown>) => (handoff ? gravando.then(() => passarPraLoja(amb.conversas, amb.atualizarConversa, tenantId, { ...handoff, agora })) : gravando);
  if (ev.event === "message.received" && ev.message.platform === "instagram" && ev.message.direction === "incoming") {
    ctx.pendentes.push(depois(registrarRecebida(amb.conversas, tenantId, ev, { igAccountId: ctx.igAccountId, envios: ctx.envios, pausado: ctx.pausado || handoff !== null, runId: d.kind === "handled" ? d.runId : null, agora, situacao: modoDaSituacao(d) })));
  } else if (ev.event === "comment.received" && d.kind === "handled") {
    // A resposta privada não devolve a conversa: sem conversa conhecida, não há onde gravar.
    ctx.pendentes.push(depois(gravarEnvios(amb.conversas, tenantId, ctx.conversaDoComentario?.id ?? null, ctx.envios, d.runId, agora)));
  } else if (ev.event === "message.sent" && ev.message.platform === "instagram") {
    ctx.pendentes.push(registrarEnviada(amb.conversas, tenantId, ev, agora));
  }
}

/**
 * Traduz o evento, acha a loja, escolhe o fluxo, aplica as proteções, grava o
 * run (idempotente por source_id) e executa o primeiro passo na mesma chamada.
 * Nada que não casa deixa rastro no banco, fora a ficha e o índice das Conversas.
 */
export async function tratarEvento(ev: EventoZernio, amb: Ambiente): Promise<Desfecho> {
  const ctx: Contexto = { pendentes: [], envios: [], tenantId: null, igAccountId: "", pausado: false, conversaDoComentario: null, handoff: null };
  try {
    let d: Desfecho;
    try {
      d = await processar(ev, amb, ctx);
    } catch (e) {
      // Exceção: a Zernio reenvia, mas o direct já fica na lista como Aguardando você.
      registrarNoIndice(ev, { kind: "retry", reason: "erro" }, ctx, amb);
      throw e;
    }
    registrarNoIndice(ev, d, ctx, amb);
    return d;
  } finally {
    await esperarFicha(ctx.pendentes, amb.tetoDaFichaMs ?? TETO_FICHA_MS);
  }
}

/** A ficha é registro: banco travado não pode segurar o ack. Estourou o teto, segue (a gravação continua e nunca rejeita). */
async function esperarFicha(pendentes: Promise<unknown>[], tetoMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const estourou = new Promise<"teto">((ok) => { timer = setTimeout(() => ok("teto"), tetoMs); });
  const r = await Promise.race([Promise.all(pendentes).then(() => "ok" as const), estourou]);
  clearTimeout(timer);
  if (r === "teto") console.error("[ig/ficha] gravação passou do teto; o atendimento segue");
}

async function processar(ev: EventoZernio, amb: Ambiente, ctx: Contexto): Promise<Desfecho> {
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
  ctx.tenantId = tenantId;
  ctx.igAccountId = conta.id;
  // O que a conta mandou só atualiza o índice (feito por quem chama); não dispara fluxo nem pausa o robô.
  if (ev.event === "message.sent") return { kind: "ignored", reason: "enviada" };

  const agora = amb.now();
  // Todo direct recebido grava a ficha, tenha fluxo ou não (spec §5.3).
  const fichaDoDirect = ev.event === "message.received" ? gravarDirect(ev, tenantId, agora, amb) : null;
  if (fichaDoDirect) ctx.pendentes.push(fichaDoDirect);
  const entrada = ev.event === "comment.received" ? deComentario(ev, agora.getTime()) : deMensagem(ev, agora.getTime());
  if (!entrada) return { kind: "ignored", reason: "evento sem gatilho" };

  // Robô pausado (a loja respondeu pelo painel): nada abre nem retoma para essa pessoa. Comentário só confere depois de casar um fluxo.
  if (ev.event === "message.received") {
    // Falha passageira: sem saber se está pausado, o robô não responde e a Zernio reenvia. Erro que se repete
    // (tabela ausente, permissão) não pode emudecer o robô em loop: segue como não pausado.
    let conversa: Awaited<ReturnType<Conversas["ler"]>> = null;
    try {
      conversa = await amb.conversas.ler(tenantId, entrada.igUserId);
    } catch (e) {
      registrarFalha("ler", e);
      if (falhaPassageira(e)) return { kind: "retry", reason: "conversa" };
    }
    if (robotPausado(conversa, agora)) {
      ctx.pausado = true;
      return { kind: "ignored", reason: "robô pausado" };
    }
  }

  const fluxos = await amb.fluxosNoAr(tenantId);
  let contato = contatoDaPessoa(amb.contatos, tenantId, entrada.igUserId, entrada.username, agora.toISOString(), fichaDoDirect);
  // Direct de quem tem run esperando resposta avança aquele run em vez de abrir outro.
  if (ev.event === "message.received") {
    const retomado = await retomarSeEsperando(ev, entrada, conta.id, tenantId, fluxos, contato, amb, ctx);
    if (retomado) return retomado;
  }

  const escolha = escolherFluxo(fluxos, entrada.origem);
  if (!escolha) return { kind: "ignored", reason: "sem fluxo" };
  if (ev.event === "comment.received") {
    ctx.conversaDoComentario = await lerConversa(amb.conversas, tenantId, entrada.igUserId);
    if (robotPausado(ctx.conversaDoComentario, agora)) return { kind: "ignored", reason: "robô pausado" };
  }

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

  // Comentário que entrou num fluxo (passou as travas) cria a pessoa, sem abrir a janela do direct.
  if (ev.event === "comment.received") {
    const gravando = gravarEntradaPorComentario(entrada, escolha.flowId, tenantId, agora, amb);
    ctx.pendentes.push(gravando);
    contato = contatoDaPessoa(amb.contatos, tenantId, entrada.igUserId, entrada.username, agora.toISOString(), gravando);
  }
  // Reenvio de run na fila: cada Se… repete a saída que a 1ª tentativa tomou.
  const saidas = existente ? saidasReusaveis(await amb.runs.passos(tenantId, run.id), null) : undefined;

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
    const r = await advance(escolha.def, estado, depsDoRun(tenantId, run, contato, amb, ctx, saidas));
    await gravar(tenantId, run.id, r, amb);
    if (r.handoff) ctx.handoff = { igUserId: entrada.igUserId, runId: run.id };
    return { kind: "handled", tenantId, runId: run.id, status: r.status };
  } catch (e) {
    // O run fica `queued`: o reenvio da Zernio o retoma depois de 2 min. Se o direct que
    // falhou espera resposta, ele pode ter saído: o run já ouve a resposta enquanto isso.
    if (e instanceof EsperaIncerta) {
      await amb.runs.atualizar(tenantId, run.id, { node_id: e.nodeId, waiting: "reply", wake_at: e.wakeAt });
      return { kind: "retry", reason: e.causa.code };
    }
    if (e instanceof ZernioError && e.transient) return { kind: "retry", reason: e.code };
    throw e;
  }
}

/**
 * A ficha de quem escreveu. Erro aqui não derruba o atendimento: a ficha é registro, o motor é o que importa
 * (o contato reaparece na próxima mensagem).
 */
async function gravarDirect(ev: MensagemRecebida, tenantId: string, agora: Date, amb: Ambiente): Promise<Ficha | null> {
  const m = ev.message;
  if (m.platform !== "instagram" || m.direction !== "incoming") return null;
  try {
    return await amb.contatos.aplicar(tenantId, { igUserId: m.sender.id, username: m.sender.username ?? null, seenAt: iso(ou(m.sentAt, agora.getTime())), dm: true });
  } catch (e) {
    registrarFalhaDaFicha(e);
    return null;
  }
}

async function gravarEntradaPorComentario(entrada: Entrada, flowId: string, tenantId: string, agora: Date, amb: Ambiente): Promise<Ficha | null> {
  try {
    return await amb.contatos.aplicar(tenantId, { igUserId: entrada.igUserId, username: entrada.username, seenAt: agora.toISOString(), dm: false, sourceFlowId: flowId });
  } catch (e) {
    registrarFalhaDaFicha(e);
    return null;
  }
}

/** Saídas dos Se… registradas depois do bloco da retomada (`aposNo`) ou, sem ele, desde o início do run. */
function saidasReusaveis(passos: Array<{ node_id: string; out: string }>, aposNo: string | null): Map<string, FlowOut> {
  let desde = 0;
  if (aposNo !== null) {
    const i = passos.map((p) => p.node_id).lastIndexOf(aposNo);
    if (i < 0) return new Map();
    desde = i + 1;
  }
  const saidas = new Map<string, FlowOut>();
  // O banco guarda a saída como texto; só entram `FlowOut`s que o próprio motor gravou.
  for (const p of passos.slice(desde)) if (!saidas.has(p.node_id)) saidas.set(p.node_id, p.out as FlowOut);
  return saidas;
}

function depsDoRun(tenantId: string, run: RunRow, contato: Contato, amb: Ambiente, ctx: Contexto, saidasGravadas?: ReadonlyMap<string, FlowOut>): Deps {
  return {
    saidasGravadas,
    enviado: (nodeId, messageId, tipo) => { ctx.envios.push({ nodeId, messageId, tipo }); },
    transport: amb.transport,
    now: amb.now,
    contato,
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

/** `reenvio`: este evento já reivindicou o run numa tentativa anterior (só então as saídas dos Se… se repetem). */
type Achado = { run: RunRow; reivindicado: boolean; reenvio: boolean } | Desfecho | null;

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
    return run ? { run, reivindicado: false, reenvio: false } : null;
  }
  // Voltou pra espera depois de um erro passageiro: reivindica de novo, como da primeira vez.
  if (ja.status === "active" && ja.waiting === "reply") return { run: ja, reivindicado: false, reenvio: true };
  if (ja.status !== "active" || ja.waiting !== null) return { kind: "ignored", reason: "duplicado" };
  // Retomada sem desfecho gravado: a 1ª tentativa ainda roda, ou a função caiu no meio.
  if (agora.getTime() - Date.parse(ja.updated_at) <= RETOMADA_MS) return { kind: "retry", reason: "em andamento" };
  if (!(await amb.runs.retomarParado(tenantId, ja.id, ja.updated_at))) return { kind: "retry", reason: "corrida" };
  return { run: ja, reivindicado: true, reenvio: true };
}

/**
 * Retoma o run que esperava resposta desta pessoa. `null` = não havia o que
 * retomar (ou a resposta não liberou o bloco): o direct segue o caminho normal.
 */
async function retomarSeEsperando(ev: MensagemRecebida, entrada: Entrada, igAccountId: string, tenantId: string, fluxos: readonly FluxoNoAr[], contato: Contato, amb: Ambiente, ctx: Contexto): Promise<Desfecho | null> {
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
  let retomada = decidirRetomada(def, no, run.id, ev);
  if (!achado.reivindicado) {
    // Sem saída que case (ou `other` sem ligação): não reivindica, o run segue esperando.
    if (!retomada) return null;
    if (!(await amb.runs.reivindicar(tenantId, run.id, nodeId, entrada.sourceId))) return { kind: "ignored", reason: "duplicado" };
  }
  // Run já reivindicado por este direct e fluxo republicado no meio: termina por uma saída que existe.
  retomada ??= { nodeId, out: saidaDeReserva(no) };

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
  try {
    // Primeira tentativa nunca reusa: o passo deste bloco ainda não foi gravado e `nodeId` acharia uma passagem velha de um ciclo.
    const saidas = achado.reenvio ? saidasReusaveis(await amb.runs.passos(tenantId, run.id), nodeId) : undefined;
    const r = await advance(def, estado, depsDoRun(tenantId, run, contato, amb, ctx, saidas), retomada);
    await gravar(tenantId, run.id, r, amb);
    if (r.handoff) ctx.handoff = { igUserId: entrada.igUserId, runId: run.id };
    return { kind: "handled", tenantId, runId: run.id, status: r.status };
  } catch (e) {
    // Volta pra espera: o reenvio reivindica de novo e a Idempotency-Key segura o direct repetido.
    await amb.runs.atualizar(tenantId, run.id, { waiting: "reply" });
    const passageiro = e instanceof EsperaIncerta ? e.causa : e;
    if (passageiro instanceof ZernioError && passageiro.transient) return { kind: "retry", reason: passageiro.code };
    throw e;
  }
}
