import { z } from "zod";
import { chaveDeEnvio, decidirEnvio, marcasDoFio, pausaAte, rotulosPorMensagem, ultimaDela } from "@/lib/ig/conversas/fio";
import { carregarConversa, corpoInvalido, pausaVigente, requireConversas, responderErroConversa, zernioDaLoja } from "@/lib/ig/conversas/http";
import { janela, situacaoAoResponderPelaLoja } from "@/lib/ig/conversas/situacao";
import type { FioDaConversa, MensagemDto } from "@/lib/ig/conversas/tipos";
import type { InboxMessage } from "@/lib/ig/zernio-inbox";
import { applyContact, getContactByIgUserId } from "@/lib/stores/ig-contacts";
import { listConversationEvents, recordConversationEvent, touchConversation, updateConversation } from "@/lib/stores/ig-conversations";
import { stopWaitingRunsOfPerson } from "@/lib/stores/ig-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A lista de mensagens da Zernio pode ser lenta (60–207 s em 08/10); o cliente dela desiste em 25 s.
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const PAGINA = 50;
/** O cursor é da Zernio e opaco; passa adiante, mas com teto de tamanho. */
const CURSOR_MAX = 512;

const enviarSchema = z.object({ texto: z.string().trim().min(1).max(1000), idempotencyKey: z.string().uuid() });

/** Anexos saem SEM a URL da Zernio: a tela usa `/media?mid=&i=` com o `id` da mensagem e o `indice`. */
function paraMensagem(m: InboxMessage, rotulos: ReturnType<typeof rotulosPorMensagem>): MensagemDto {
  const nossa = m.direction === "outgoing";
  const rotulo = nossa ? rotulos.get(m.id) : undefined;
  return {
    id: m.id,
    direcao: nossa ? "out" : "in",
    texto: m.isDeleted ? null : m.message,
    criadaEm: m.createdAt,
    autor: rotulo?.autor ?? null,
    runId: rotulo?.runId ?? null,
    anexos: m.isDeleted ? [] : m.attachments.map((a, indice) => ({ indice, tipo: a.type, mime: a.mimeType, nome: a.filename })),
    respostaDeStory: m.storyReply,
    mencaoEmStory: m.isStoryMention,
    apagada: m.isDeleted,
  };
}

// GET /api/ig/conversations/[id]/messages?cursor= — mensagens pela Zernio (mais novas primeiro), com rótulos, marcas e a janela da Meta.
export async function GET(req: Request, { params }: Ctx) {
  try {
    const ctx = await requireConversas(req);
    const { id } = await params;
    const { conversa, accountId } = await carregarConversa(ctx.tenantId, id);
    const cursor = new URL(req.url).searchParams.get("cursor") || undefined;
    if (cursor && cursor.length > CURSOR_MAX) return corpoInvalido();
    const [pagina, eventos, ficha] = await Promise.all([
      zernioDaLoja().listMessages({ conversationId: conversa.zernio_conversation_id, accountId, cursor, limit: PAGINA }),
      listConversationEvents(ctx.tenantId, id),
      getContactByIgUserId(ctx.tenantId, conversa.ig_user_id),
    ]);
    // Conversa importada: a ficha não sabe quando ela escreveu. Calcula pela última mensagem recebida e grava.
    let lastDmAt = ficha?.last_dm_at ?? null;
    if (!lastDmAt) {
      const ultima = ultimaDela(pagina.items);
      if (ultima) {
        await applyContact(ctx.tenantId, { igUserId: conversa.ig_user_id, username: conversa.username, seenAt: ultima, dm: true });
        lastDmAt = ultima;
      }
    }
    const agora = new Date();
    const rotulos = rotulosPorMensagem(eventos);
    const corpo: FioDaConversa = {
      mensagens: pagina.items.map((m) => paraMensagem(m, rotulos)),
      proximo: pagina.nextCursor,
      marcas: marcasDoFio(eventos),
      janela: { estado: janela(lastDmAt, agora), ultimaDelaEm: lastDmAt },
      roboPausadoAte: pausaVigente(conversa, agora),
    };
    return Response.json(corpo);
  } catch (e) {
    return responderErroConversa(e);
  }
}

// POST /api/ig/conversations/[id]/messages — { texto, idempotencyKey }. Só texto (foto e vídeo vêm no PR 2e).
export async function POST(req: Request, { params }: Ctx) {
  try {
    const ctx = await requireConversas(req);
    const { id } = await params;
    const corpo = enviarSchema.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return corpoInvalido();
    const { conversa, accountId } = await carregarConversa(ctx.tenantId, id);
    const agora = new Date();
    const ficha = await getContactByIgUserId(ctx.tenantId, conversa.ig_user_id);
    const envio = decidirEnvio(ficha?.last_dm_at ?? null, agora);
    if (!envio.ok) return Response.json({ error: "A janela de 7 dias fechou. Só dá para responder quando a pessoa escrever de novo.", code: "janela_fechada" }, { status: 409 });
    const enviada = await zernioDaLoja().sendText({ conversationId: conversa.zernio_conversation_id, accountId, message: corpo.data.texto, humanAgent: envio.humanAgent, idempotencyKey: chaveDeEnvio(ctx.tenantId, id, corpo.data.idempotencyKey) });
    // A mensagem JÁ SAIU: nada abaixo pode virar erro para a loja. Primeiro o que protege a pessoa (§6: sem a pausa e sem
    // encerrar a espera, um "sim" dela retomaria um fluxo velho), depois o registro. Falhas só avisam `registroParcial`.
    // A proteção ganha uma segunda tentativa: sem ela não há quem refaça a pausa nem o fim da espera depois do 200.
    const comUmaRepeticao = <T,>(f: () => Promise<T>): Promise<T> => f().catch(() => f());
    const protecao = await Promise.allSettled([
      comUmaRepeticao(() => updateConversation(ctx.tenantId, id, { unread_count: 0, bot_paused_until: pausaAte(agora) })),
      comUmaRepeticao(() => stopWaitingRunsOfPerson(ctx.tenantId, { igUserId: conversa.ig_user_id, username: conversa.username }, "replied_by_store")),
    ]);
    const registro = await Promise.allSettled([
      enviada.messageId ? recordConversationEvent(ctx.tenantId, { conversationId: id, kind: "store_message", zernioMessageId: enviada.messageId, occurredAt: agora.toISOString() }) : Promise.resolve(),
      touchConversation(ctx.tenantId, { zernioConversationId: conversa.zernio_conversation_id, igUserId: conversa.ig_user_id, igAccountId: conversa.ig_account_id, direction: "out", at: agora.toISOString(), preview: corpo.data.texto, status: situacaoAoResponderPelaLoja() }),
    ]);
    const falhas = [...protecao, ...registro].filter((r): r is PromiseRejectedResult => r.status === "rejected");
    // Só o tipo do erro: a mensagem do PostgREST pode trazer dado da loja.
    for (const f of falhas) console.error("[ig/conversas] registro do envio falhou:", f.reason instanceof Error ? f.reason.name : typeof f.reason);
    return Response.json({ ok: true, messageId: enviada.messageId, ...(falhas.length ? { registroParcial: true } : {}) });
  } catch (e) {
    return responderErroConversa(e);
  }
}
