import "server-only";

import { decidirEnvio, pausaAte } from "@/lib/ig/conversas/fio";
import { InboxError } from "@/lib/ig/zernio-inbox";
import { getContactByIgUserId } from "@/lib/stores/ig-contacts";
import { recordConversationEvent, touchConversation, updateConversation, type IgConversationRow } from "@/lib/stores/ig-conversations";
import { stopWaitingRunsOfPerson } from "@/lib/stores/ig-runs";
import { carregarConversa, responderErroConversa } from "./http";
import { situacaoAoResponderPelaLoja } from "./situacao";

/** O que as rotas que mandam mensagem PELA LOJA (texto, foto, vídeo, convite) têm em comum. */

export type EnvioAberto = { conversa: IgConversationRow; accountId: string; agora: Date; humanAgent: boolean };

/** A conversa é da loja e a janela da Meta deixa responder; senão lança a `Response` (404, 409 `janela_fechada`). */
export async function abrirEnvio(tenantId: string, id: string): Promise<EnvioAberto> {
  const { conversa, accountId } = await carregarConversa(tenantId, id);
  const agora = new Date();
  const ficha = await getContactByIgUserId(tenantId, conversa.ig_user_id);
  const envio = decidirEnvio(ficha?.last_dm_at ?? null, agora);
  if (!envio.ok) throw Response.json({ error: "A janela de 7 dias fechou. Só dá para responder quando a pessoa escrever de novo.", code: "janela_fechada" }, { status: 409 });
  return { conversa, accountId, agora, humanAgent: envio.humanAgent };
}

const comUmaRepeticao = <T,>(f: () => Promise<T>): Promise<T> => f().catch(() => f());

/**
 * A mensagem JÁ SAIU: nada aqui pode virar erro para a loja. Primeiro o que protege a pessoa (§6: sem a pausa e sem
 * encerrar a espera, um "sim" dela retomaria um fluxo velho), depois o registro (um evento por mensagem que saiu).
 * A proteção ganha uma segunda tentativa: sem ela não há quem refaça a pausa nem o fim da espera depois do 200.
 * Falhas só viram `registroParcial`; o log leva o tipo do erro, nunca a mensagem (o PostgREST pode trazer dado da loja).
 */
export async function concluirEnvio(tenantId: string, aberto: EnvioAberto, saiu: { mensagemIds: string[]; previa: string }): Promise<{ registroParcial: boolean }> {
  const { conversa, agora } = aberto;
  const protecao = await Promise.allSettled([
    comUmaRepeticao(() => updateConversation(tenantId, conversa.id, { unread_count: 0, bot_paused_until: pausaAte(agora) })),
    comUmaRepeticao(() => stopWaitingRunsOfPerson(tenantId, { igUserId: conversa.ig_user_id, username: conversa.username }, "replied_by_store")),
  ]);
  const registro = await Promise.allSettled([
    ...saiu.mensagemIds.map((zernioMessageId) => recordConversationEvent(tenantId, { conversationId: conversa.id, kind: "store_message", zernioMessageId, occurredAt: agora.toISOString() })),
    touchConversation(tenantId, { zernioConversationId: conversa.zernio_conversation_id, igUserId: conversa.ig_user_id, igAccountId: conversa.ig_account_id, direction: "out", at: agora.toISOString(), preview: saiu.previa, status: situacaoAoResponderPelaLoja() }),
  ]);
  const falhas = [...protecao, ...registro].filter((r): r is PromiseRejectedResult => r.status === "rejected");
  for (const f of falhas) console.error("[ig/conversas] registro do envio falhou:", f.reason instanceof Error ? f.reason.name : typeof f.reason);
  return { registroParcial: falhas.length > 0 };
}

/** Como `responderErroConversa`, mais o anexo que a Zernio não conseguiu baixar (422 `attachment_fetch_failed`). */
export function responderErroDoEnvio(e: unknown): Response {
  if (e instanceof InboxError && e.code === "attachment_fetch_failed") return Response.json({ error: "O Instagram não conseguiu baixar o arquivo. Tente enviar de novo.", code: "anexo_inacessivel" }, { status: 422 });
  return responderErroConversa(e);
}
