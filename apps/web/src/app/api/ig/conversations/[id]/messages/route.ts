import { z } from "zod";
import { classificarAnexo } from "@/lib/ig/conversas/anexo";
import { assinaturaDeEnvio } from "@/lib/ig/conversas/campo";
import { abrirEnvio, concluirEnvio, responderErroDoEnvio, type EnvioAberto } from "@/lib/ig/conversas/envio";
import { chaveDeEnvio, marcasDoFio, rotulosPorMensagem, ultimaDela } from "@/lib/ig/conversas/fio";
import { carregarConversa, corpoInvalido, pausaVigente, requireConversas, responderErroConversa, zernioDaLoja } from "@/lib/ig/conversas/http";
import { janela } from "@/lib/ig/conversas/situacao";
import type { FioDaConversa, MensagemDto } from "@/lib/ig/conversas/tipos";
import type { InboxMessage } from "@/lib/ig/zernio-inbox";
import { midiaParaEnvio } from "@/lib/media-store";
import { applyContact, getContactByIgUserId } from "@/lib/stores/ig-contacts";
import { listConversationEvents } from "@/lib/stores/ig-conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A lista de mensagens da Zernio pode ser lenta (60–207 s em 08/10); o cliente dela desiste em 25 s.
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const PAGINA = 50;
/** O cursor é da Zernio e opaco; passa adiante, mas com teto de tamanho. */
const CURSOR_MAX = 512;

/** Texto, foto/vídeo (`midiaId` do upload direto) ou os dois; pelo menos um. */
const enviarSchema = z
  .object({ texto: z.string().trim().max(1000).optional(), midiaId: z.string().min(1).max(300).optional(), idempotencyKey: z.string().uuid() })
  .refine((c) => Boolean(c.texto || c.midiaId));

/** O link assinado de leitura que a Zernio baixa: curto e só para este envio. */
const LINK_DA_MIDIA_SEGUNDOS = 600;

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

type Corpo = z.infer<typeof enviarSchema>;

/**
 * Manda pela Zernio e devolve os ids das mensagens que saíram (com texto + anexo, duas). `Response` de volta = recusa
 * antes de mandar: mídia que não é da loja é 404, tipo ou tamanho fora do limite do Instagram é 400. O link assinado
 * fica só aqui: não vai ao navegador nem ao log.
 */
async function mandar(tenantId: string, id: string, aberto: EnvioAberto, corpo: Corpo): Promise<{ ids: string[]; previa: string } | Response> {
  const comum = { conversationId: aberto.conversa.zernio_conversation_id, accountId: aberto.accountId, humanAgent: aberto.humanAgent, idempotencyKey: chaveDeEnvio(tenantId, id, corpo.idempotencyKey, assinaturaDeEnvio(corpo.midiaId ? "midia" : "texto", corpo)) };
  if (!corpo.midiaId) {
    const texto = corpo.texto ?? "";
    const { messageId } = await zernioDaLoja().sendText({ ...comum, message: texto });
    return { ids: messageId ? [messageId] : [], previa: texto };
  }
  const midia = await midiaParaEnvio(corpo.midiaId, tenantId, LINK_DA_MIDIA_SEGUNDOS);
  if (!midia) return Response.json({ error: "Arquivo não encontrado. Envie de novo.", code: "midia_nao_achou" }, { status: 404 });
  const anexo = classificarAnexo(midia.mime, midia.size);
  if (!anexo.ok) return Response.json({ error: anexo.mensagem, code: "anexo_invalido" }, { status: 400 });
  const { messageIds } = await zernioDaLoja().sendMedia({ ...comum, attachmentUrl: midia.url, attachmentType: anexo.tipo, ...(corpo.texto ? { message: corpo.texto } : {}) });
  return { ids: messageIds, previa: corpo.texto || (anexo.tipo === "image" ? "Foto" : "Vídeo") };
}

// POST /api/ig/conversations/[id]/messages — { texto?, midiaId?, idempotencyKey }, pelo menos um dos dois.
export async function POST(req: Request, { params }: Ctx) {
  try {
    const ctx = await requireConversas(req);
    const { id } = await params;
    const corpo = enviarSchema.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return corpoInvalido();
    const aberto = await abrirEnvio(ctx.tenantId, id);
    const saiu = await mandar(ctx.tenantId, id, aberto, corpo.data);
    if (saiu instanceof Response) return saiu;
    const { registroParcial } = await concluirEnvio(ctx.tenantId, aberto, { mensagemIds: saiu.ids, previa: saiu.previa });
    return Response.json({ ok: true, messageId: saiu.ids[0] ?? null, messageIds: saiu.ids, ...(registroParcial ? { registroParcial: true } : {}) });
  } catch (e) {
    return responderErroDoEnvio(e);
  }
}
