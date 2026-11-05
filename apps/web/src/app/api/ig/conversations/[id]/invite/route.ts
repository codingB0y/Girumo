import { z } from "zod";
import { abrirEnvio, concluirEnvio, responderErroDoEnvio } from "@/lib/ig/conversas/envio";
import { chaveDeEnvio } from "@/lib/ig/conversas/fio";
import { corpoInvalido, requireConversas, zernioDaLoja } from "@/lib/ig/conversas/http";
import { linkDaCampanha } from "@/lib/ig/engine/link";
import { DEFAULT_TEXTS } from "@/lib/ig/flow/recipes";
import { getCampaignGroupById } from "@/lib/stores/campaign-groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const convidarSchema = z.object({ campanhaId: z.string().uuid(), idempotencyKey: z.string().uuid() });

// POST /api/ig/conversations/[id]/invite — { campanhaId, idempotencyKey }. Manda o texto curto com o botão de URL do
// grupo (spec §7.9). O link é o da campanha SEM `?ig=`: o clique atribuído à conversa é da fase 3.
export async function POST(req: Request, { params }: Ctx) {
  try {
    const ctx = await requireConversas(req);
    const { id } = await params;
    const corpo = convidarSchema.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return corpoInvalido();
    const aberto = await abrirEnvio(ctx.tenantId, id);
    const campanha = await getCampaignGroupById(ctx.tenantId, corpo.data.campanhaId);
    if (!campanha?.slug) return Response.json({ error: "Campanha não encontrada.", code: "campanha_nao_achou" }, { status: 404 });
    const url = await linkDaCampanha(ctx.tenantId, campanha.slug);
    const { messageId } = await zernioDaLoja().sendButtons({
      conversationId: aberto.conversa.zernio_conversation_id,
      accountId: aberto.accountId,
      message: DEFAULT_TEXTS.conviteComBotao,
      buttons: [{ type: "url", title: DEFAULT_TEXTS.botaoConvite, url }],
      humanAgent: aberto.humanAgent,
      idempotencyKey: chaveDeEnvio(ctx.tenantId, id, corpo.data.idempotencyKey),
    });
    const { registroParcial } = await concluirEnvio(ctx.tenantId, aberto, { mensagemIds: messageId ? [messageId] : [], previa: DEFAULT_TEXTS.botaoConvite });
    return Response.json({ ok: true, messageId, ...(registroParcial ? { registroParcial: true } : {}) });
  } catch (e) {
    return responderErroDoEnvio(e);
  }
}
