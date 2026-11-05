import { z } from "zod";
import { pausaAte } from "@/lib/ig/conversas/fio";
import { corpoInvalido, naoAchouConversa, paraConversa, requireConversas, responderErroConversa } from "@/lib/ig/conversas/http";
import { isUuid } from "@/lib/ig/flow/body";
import { getConversationById, recordConversationEvent, updateConversation, type ConversationEventKind, type ConversationPatch } from "@/lib/stores/ig-conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const corpoSchema = z.object({ acao: z.enum(["resolver", "pausar", "retomar"]) });

/** Cada ação: o que muda no índice e o evento (motivo curto, nunca texto de mensagem) que fica no registro. */
function efeito(acao: "resolver" | "pausar" | "retomar", agora: Date): { patch: ConversationPatch; evento: { kind: ConversationEventKind; detail: string } } {
  if (acao === "resolver") return { patch: { status: "resolved", bot_paused_until: null }, evento: { kind: "resolved", detail: "loja" } };
  if (acao === "pausar") return { patch: { bot_paused_until: pausaAte(agora) }, evento: { kind: "paused", detail: "pausado_pela_loja" } };
  return { patch: { bot_paused_until: null }, evento: { kind: "paused", detail: "retomado_pela_loja" } };
}

// PATCH /api/ig/conversations/[id] — { acao: "resolver" | "pausar" | "retomar" }. Não fala com a Zernio.
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const ctx = await requireConversas(req);
    const { id } = await params;
    if (!isUuid(id)) return naoAchouConversa();
    const corpo = corpoSchema.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return corpoInvalido();
    if (!(await getConversationById(ctx.tenantId, id))) return naoAchouConversa();
    const agora = new Date();
    const { patch, evento } = efeito(corpo.data.acao, agora);
    const nova = await updateConversation(ctx.tenantId, id, patch);
    if (!nova) return naoAchouConversa();
    // A conversa já mudou: falha ao anotar o evento não pode virar 500 (só o tipo vai para o log).
    await recordConversationEvent(ctx.tenantId, { conversationId: id, ...evento, occurredAt: agora.toISOString() }).catch((err) => console.error("[ig/conversas] evento não gravado:", err instanceof Error ? err.name : typeof err));
    return Response.json({ conversa: paraConversa(nova, agora) });
  } catch (e) {
    return responderErroConversa(e);
  }
}
