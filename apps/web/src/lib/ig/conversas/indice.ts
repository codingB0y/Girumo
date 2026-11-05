import type { MensagemEnviada, MensagemRecebida } from "@/lib/ig/webhook/events";
import type { ConversationEventInput, IgConversationRow, TouchInput } from "@/lib/stores/ig-conversations";
import { situacaoAoReceber } from "./situacao";

/** O que o webhook usa do índice das Conversas (spec §7): a rota liga nas stores; o teste, em memória. */
export type Conversas = {
  ler: (tenantId: string, igUserId: string) => Promise<IgConversationRow | null>;
  tocar: (tenantId: string, input: TouchInput) => Promise<IgConversationRow>;
  evento: (tenantId: string, e: ConversationEventInput) => Promise<void>;
};

/** Mensagem que o robô mandou neste evento. `messageId` null = saiu, mas a Zernio não devolveu o id. */
export type EnvioDoRobo = { nodeId: string; messageId: string | null; tipo: string };

const iso = (texto: string, reserva: Date) => {
  const ms = Date.parse(texto);
  return new Date(Number.isFinite(ms) ? ms : reserva.getTime()).toISOString();
};

/** Só a operação e o tipo do erro: a mensagem do PostgREST pode trazer chave, tenant e @ da pessoa. */
export function registrarFalha(op: "ler" | "tocar" | "evento", e: unknown): void {
  const tipo = e instanceof Error ? ((e as { code?: unknown }).code ?? e.name) : typeof e;
  console.error(`[ig/conversas] ${op} falhou:`, String(tipo));
}

/** Como a situação do direct é decidida: pelo que o robô fez, forçada em Aguardando você (retry, exceção) ou mantida (reentrega). */
export type ModoDaSituacao = "auto" | "waiting" | "manter";

export const robotPausado = (c: IgConversationRow | null, agora: Date): boolean => !!c?.bot_paused_until && Date.parse(c.bot_paused_until) > agora.getTime();

/** Lê a conversa da pessoa. Banco fora do ar = sem conversa conhecida: o robô segue, o índice se refaz na próxima mensagem. */
export async function lerConversa(conversas: Conversas, tenantId: string, igUserId: string): Promise<IgConversationRow | null> {
  try {
    return await conversas.ler(tenantId, igUserId);
  } catch (e) {
    registrarFalha("ler", e);
    return null;
  }
}

/** Eventos `bot_message` (sem texto) das mensagens com id; sem conversa conhecida não grava. */
export async function gravarEnvios(conversas: Conversas, tenantId: string, conversationId: string | null, envios: EnvioDoRobo[], runId: string | null, agora: Date): Promise<void> {
  if (!conversationId) return;
  for (const e of envios) {
    if (!e.messageId) continue;
    try {
      await conversas.evento(tenantId, { conversationId, kind: "bot_message", zernioMessageId: e.messageId, runId, detail: e.tipo, occurredAt: agora.toISOString() });
    } catch (err) {
      registrarFalha("evento", err);
    }
  }
}

/**
 * Direct recebido: atualiza o índice (situação pela §7.3) e grava um evento por mensagem do robô.
 * Nunca rejeita: o direct já foi (ou não) respondido e a Zernio não deve reenviá-lo por causa do índice.
 */
export async function registrarRecebida(conversas: Conversas, tenantId: string, ev: MensagemRecebida, i: { igAccountId: string; envios: EnvioDoRobo[]; pausado: boolean; runId: string | null; agora: Date; situacao: ModoDaSituacao }): Promise<void> {
  const m = ev.message;
  try {
    const conversa = await conversas.tocar(tenantId, {
      zernioConversationId: ev.conversation.id,
      igUserId: m.sender.id,
      igAccountId: i.igAccountId,
      username: m.sender.username ?? null,
      displayName: m.sender.name ?? null,
      direction: "in",
      at: iso(m.sentAt, i.agora),
      preview: m.text,
      status: i.situacao === "manter" ? null : i.situacao === "waiting" ? "waiting" : situacaoAoReceber({ robotRespondeu: i.envios.length > 0, robotPausado: i.pausado }),
      messageId: m.platformMessageId,
    });
    await gravarEnvios(conversas, tenantId, conversa.id, i.envios, i.runId, i.agora);
  } catch (e) {
    registrarFalha("tocar", e);
  }
}

/**
 * `message.sent`: só atualiza a última mensagem e a direção de conversa que já existe. Não soma não
 * lida e não pausa o robô (`sentVia` null é ambíguo; só a resposta pelo painel pausa). O envio da nossa
 * própria API volta por aqui: o `touch` só anda para frente, então é inofensivo.
 */
export async function registrarEnviada(conversas: Conversas, tenantId: string, ev: MensagemEnviada, agora: Date): Promise<void> {
  try {
    const existente = await lerConversa(conversas, tenantId, ev.conversation.participantId);
    if (!existente) return;
    await conversas.tocar(tenantId, {
      zernioConversationId: existente.zernio_conversation_id,
      igUserId: ev.conversation.participantId,
      username: ev.conversation.participantUsername ?? null,
      displayName: ev.conversation.participantName ?? null,
      direction: "out",
      at: iso(ev.message.sentAt, agora),
      preview: ev.message.text,
      status: null,
    });
  } catch (e) {
    registrarFalha("tocar", e);
  }
}
