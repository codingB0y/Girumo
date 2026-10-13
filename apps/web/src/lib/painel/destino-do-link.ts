import type { EntradaSettings } from "@/lib/campaigns/settings";
import type { EstadoGrupo } from "@/lib/groups/estado";
import { resolveClickTarget, toResolvableGroup } from "@/lib/links/resolve-click-target";
import { paradoDoLink } from "@/lib/painel/link-parado";

export type DestinoDoLink = {
  grupo: EstadoGrupo | null;
  parado: { texto: string; grave: boolean } | null;
};

/**
 * Para que grupo o link mestre manda quem clica pela primeira vez agora (aba "Link e cliques").
 *
 * O mesmo `resolveClickTarget` do `/r/`, com os grupos e o estado de
 * `GET /api/campanhas/[slug]/grupos/estados` — a fonte da aba Grupos. Nada aqui decide quem
 * enche: o `estado` vem do SQL via `toResolvableGroup`. Sem grupo lembrado, de propósito: é a
 * visão de quem nunca clicou.
 *
 * `gruposNaTela` é quantos grupos a página leu de `/api/groups`: é ele que separa "os grupos
 * saíram da sua conta" de "os grupos não apareceram aqui" (`paradoDoLink`).
 */
export function destinoDoLink(input: {
  estados: EstadoGrupo[];
  groupIds: string[];
  gruposNaTela: number;
  entrada: EntradaSettings;
  agora: Date;
}): DestinoDoLink {
  const alvo = resolveClickTarget({
    link: { campaign_group_id: "campanha", target_url: "", clicks: 0, metadata: {} },
    campaign: { group_ids: input.groupIds },
    groups: input.estados.map(toResolvableGroup),
    entrada: input.entrada,
    now: input.agora,
  });
  if (alvo.kind === "blocked") {
    return {
      grupo: null,
      parado:
        alvo.reason === "cap-reached"
          ? null
          : paradoDoLink(alvo.reason, input.groupIds, input.gruposNaTela, input.entrada.lotado),
    };
  }
  return { grupo: input.estados.find((g) => g.whatsappGroupId === alvo.groupId) ?? null, parado: null };
}
