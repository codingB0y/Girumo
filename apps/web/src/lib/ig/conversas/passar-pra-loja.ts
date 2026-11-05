import type { IgConversationRow } from "@/lib/stores/ig-conversations";
import { lerConversa, type Conversas } from "./indice";

/** Quanto o robô fica calado com a pessoa depois do bloco Passar pra loja (spec §4.4). */
export const PAUSA_DO_HANDOFF_MS = 24 * 3_600_000;

/** O `updateConversation` da store: a rota liga; o teste usa uma conversa em memória. */
export type AtualizarConversa = (tenantId: string, id: string, patch: { status: "waiting"; bot_paused_until: string }) => Promise<IgConversationRow | null>;

/**
 * O run chegou num Passar pra loja: a conversa vai para Aguardando você, o robô pausa 24 h com a pessoa e fica
 * o evento `waiting` com o motivo. Nunca rejeita: o texto (se houve) já foi enviado e o índice se refaz na próxima
 * mensagem. Sem conversa no índice não há onde gravar (o `ig_conversations` exige o id da conversa da Zernio, que um
 * comentário ainda não tem): a pessoa entra no índice quando responder.
 */
export async function passarPraLoja(conversas: Conversas, atualizar: AtualizarConversa | undefined, tenantId: string, i: { igUserId: string; runId: string; agora: Date }): Promise<void> {
  if (!atualizar) {
    console.error("[ig/conversas] atualizarConversa não está ligado: o bloco Passar pra loja não pausou o robô");
    return;
  }
  try {
    const conversa = await lerConversa(conversas, tenantId, i.igUserId);
    if (!conversa) return;
    await atualizar(tenantId, conversa.id, { status: "waiting", bot_paused_until: new Date(i.agora.getTime() + PAUSA_DO_HANDOFF_MS).toISOString() });
    await conversas.evento(tenantId, { conversationId: conversa.id, kind: "waiting", runId: i.runId, detail: "handoff", occurredAt: i.agora.toISOString() });
  } catch (e) {
    // Só o tipo do erro: a mensagem do PostgREST pode trazer chave, tenant e @ da pessoa.
    const tipo = e instanceof Error ? ((e as { code?: unknown }).code ?? e.name) : typeof e;
    console.error("[ig/conversas] passar pra loja falhou:", String(tipo));
  }
}
