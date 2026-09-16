import { getTenantContext } from "@/lib/supabase/tenant-context";
import { listarComunidades } from "@/lib/stores/communities";
import { listarParticipantesDosGrupos } from "@/lib/stores/group-participants";
import { sugerirCobertura } from "@/lib/communities/cobertura";
import * as groupsStore from "@/lib/stores/groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/comunidades/[slug]/cobertura
 *
 * Alcance real (pessoas únicas, deduplicadas por participant_lid) e a
 * sugestão de quais grupos cobrem 95% dessas pessoas. Nunca envia LID de
 * participante pro cliente — só nomes de grupo e contagens agregadas.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const ctx = await getTenantContext(req);

    const comunidades = await listarComunidades(ctx.tenantId);
    const comunidade = comunidades.find((c) => c.slug === slug);
    if (!comunidade) return Response.json({ error: "Comunidade não encontrada." }, { status: 404 });

    if (comunidade.groupIds.length === 0) {
      return Response.json({
        alcanceReal: 0,
        sugestao: { grupos: [], pessoasCobertas: 0, pessoasTotais: 0, cobertura: 0 },
      });
    }

    const [grupos, participantes] = await Promise.all([
      groupsStore.listGroups(ctx.tenantId),
      listarParticipantesDosGrupos(ctx.tenantId, comunidade.groupIds),
    ]);

    const gruposDaComunidade = grupos
      .filter((g) => comunidade.groupIds.includes(g.whatsapp_group_id))
      .map((g) => ({ whatsappGroupId: g.whatsapp_group_id, name: g.name }));

    const sugestao = sugerirCobertura(gruposDaComunidade, participantes);

    return Response.json({ alcanceReal: sugestao.pessoasTotais, sugestao });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/comunidades/cobertura] falha:", error);
    return Response.json({ error: "Erro ao calcular cobertura." }, { status: 500 });
  }
}
