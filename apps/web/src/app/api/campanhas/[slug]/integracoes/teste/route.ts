import { resolveBulkCampaign } from "@/lib/groups/bulk-request";
import { readIntegracoes } from "@/lib/campaigns/settings";
import { buildCapiPayload, firstForwardedIp, sendCapiEvent } from "@/lib/campaigns/meta-capi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/campanhas/[slug]/integracoes/teste
 *
 * Manda UM evento com `test_event_code` para a aba "Testar eventos" do
 * Gerenciador. É o único jeito de o lojista saber que o token funciona sem
 * esperar um clique real — e sem sujar o pixel: evento de teste não entra na
 * otimização da campanha.
 *
 * Lê o que está no BANCO, não o que está na tela: testar o token que o
 * formulário ainda não salvou diria "funciona" sobre uma configuração que não
 * existe.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { campaign } = await resolveBulkCampaign(req, slug);
    const i = readIntegracoes(campaign.metadata as Record<string, unknown>);

    if (!i.meta.pixel_id) {
      return Response.json({ error: "Configure o ID do pixel antes de testar." }, { status: 400 });
    }
    if (!i.meta.capi_token) {
      return Response.json({ error: "Configure o token da API de Conversões antes de testar." }, { status: 400 });
    }
    if (!i.meta.test_code) {
      return Response.json(
        { error: 'Informe o código de teste que aparece na aba "Testar eventos" do Gerenciador.' },
        { status: 400 },
      );
    }

    const r = await sendCapiEvent({
      pixelId: i.meta.pixel_id,
      token: i.meta.capi_token,
      payload: buildCapiPayload({
        eventName: i.meta.evento,
        eventId: crypto.randomUUID(),
        eventTimeMs: Date.now(),
        sourceUrl: `${new URL(req.url).origin}/r/${slug}`,
        // O IP vai JUNTO do user agent: sozinho, o UA não identifica ninguém e
        // a Meta recusa com 100/2804050. Aqui o `x-forwarded-for` é o IP de
        // quem está no painel — é dele o navegador que dispara este teste.
        clientIp: firstForwardedIp(req.headers.get("x-forwarded-for")),
        userAgent: req.headers.get("user-agent") ?? "",
        fbclid: null,
        fbp: null,
        campaignName: campaign.name,
        groupId: null,
        testCode: i.meta.test_code,
      }),
    });

    if (!r.ok) {
      // O erro cru (com `fbtrace_id`) só existe aqui: a Meta não o repete, e é
      // ele que o suporte dela pede. Sem token — `raw` é só a resposta.
      console.warn(`[capi/teste] ${slug}: ${JSON.stringify(r.raw ?? { message: r.error })}`);
      return Response.json({ error: r.error ?? "A Meta recusou o evento." }, { status: 400 });
    }
    return Response.json({ events_received: r.eventsReceived ?? 0 });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: "Não deu para enviar o teste." }, { status: 500 });
  }
}
