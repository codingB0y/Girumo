import { getTenantContext } from "@/lib/supabase/tenant-context";
import * as groupsStore from "@/lib/stores/groups";
import { listarParticipantesDosGrupos } from "@/lib/stores/group-participants";
import { ehEstruturaDeComunidade } from "@/lib/communities/estrutura";
import { ehGrupoGrande, ehGrupoInterno, montarPlano, type RespostaDoPlano } from "@/lib/communities/plano";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mais que isso não é uma loja, é um corpo mal formado. */
const MAXIMO_DE_IDS = 1000;

/**
 * POST /api/comunidades/plano — body `{ incluir?: string[] }` (whatsapp_group_id).
 *
 * Só calcula: não grava nada nem fala com o WhatsApp. É POST porque a escolha de grupos pode não
 * caber numa URL. Candidato é o grupo que o número administra e que ainda não está em comunidade
 * nativa. Sem `incluir`, entram todos menos os internos (até 4 pessoas). Id que não é candidato desta
 * loja é ignorado. Nunca devolve LID de participante: só nomes de grupo e contagens.
 */
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);

    let corpo: unknown = {};
    const bruto = await req.text();
    if (bruto.trim()) {
      try {
        corpo = JSON.parse(bruto);
      } catch {
        return Response.json({ error: "Corpo inválido." }, { status: 400 });
      }
    }
    const incluir = lerIncluir(corpo);
    if (incluir === "invalido") {
      return Response.json({ error: "`incluir` precisa ser uma lista de ids de grupo." }, { status: 400 });
    }

    const grupos = await groupsStore.listGroups(ctx.tenantId);
    const candidatos = grupos.filter((g) => g.is_admin === true && !g.community_jid && !ehEstruturaDeComunidade(g));
    const escolhidos = new Set(
      incluir === null
        ? candidatos.filter((g) => !ehGrupoInterno(g.members)).map((g) => g.whatsapp_group_id)
        : incluir,
    );
    const noPlano = candidatos.filter((g) => escolhidos.has(g.whatsapp_group_id));

    const participantes =
      noPlano.length === 0
        ? []
        : await listarParticipantesDosGrupos(
            ctx.tenantId,
            noPlano.map((g) => g.whatsapp_group_id),
          );

    const plano = montarPlano(
      noPlano.map((g) => ({ whatsappGroupId: g.whatsapp_group_id, name: g.name, members: g.members })),
      participantes,
    );

    const resposta: RespostaDoPlano = {
      candidatos: candidatos.map((g) => ({
        whatsappGroupId: g.whatsapp_group_id,
        name: g.name,
        members: g.members,
        interno: ehGrupoInterno(g.members),
        grande: ehGrupoGrande(g.members),
        incluido: escolhidos.has(g.whatsapp_group_id),
      })),
      plano,
    };
    return Response.json(resposta);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/comunidades/plano] falha:", error);
    return Response.json({ error: "Erro ao montar o plano." }, { status: 500 });
  }
}

/** `null` = sem escolha (usa o padrão); `"invalido"` = veio, mas não é lista de strings. */
function lerIncluir(corpo: unknown): string[] | null | "invalido" {
  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) return "invalido";
  const valor = (corpo as { incluir?: unknown }).incluir;
  if (valor === undefined) return null;
  if (!Array.isArray(valor) || valor.length > MAXIMO_DE_IDS) return "invalido";
  if (!valor.every((id) => typeof id === "string" && id.length > 0 && id.length <= 200)) return "invalido";
  return valor;
}
