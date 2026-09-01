import { claimNext, releaseExpired } from "@/lib/stores/flash-offers";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MOTIVOS: Record<string, { mensagem: string; status: number }> = {
  sem_vaga: { mensagem: "Nao ha vaga livre agora.", status: 409 },
  fila_vazia: { mensagem: "Ninguem na fila esperando.", status: 409 },
  oferta_fechada: { mensagem: "Esta oferta ja foi fechada.", status: 409 },
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantContext(req);
    const { id } = await params;

    // Libera o vencido primeiro: sem isto uma reserva abandonada seguraria a
    // vaga e "Pegar próxima" diria "sem vaga" com a fila cheia.
    await releaseExpired(ctx.tenantId, id);

    const resultado = await claimNext(ctx.tenantId, id, ctx.authUserId);
    if (!resultado.ok) {
      const { mensagem, status } = MOTIVOS[resultado.motivo];
      return Response.json({ error: mensagem }, { status });
    }

    return Response.json({ claimId: resultado.claimId, entryId: resultado.entryId });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
