import { classificarPapel } from "@/lib/communities/papel";
import { isAdminGroup, type GroupLike } from "@/lib/evolution/admin-group";
import { tallyAdmins } from "@/lib/groups/admin-protection";

/**
 * Grupo novo pelo webhook `groups.upsert`, sem esperar o lojista sincronizar.
 *
 * A Evolution só emite esse evento para grupo criado (ou em que o número entrou)
 * DEPOIS da conexão. Antes disto ninguém o tratava: o grupo só aparecia no
 * painel quando alguém clicava em sincronizar — e, se o sync caísse no plano B
 * por tempo, nem assim.
 *
 * Passa pelo mesmo filtro de admin do sync: o payload traz `ownerPn` e
 * `participants`, então dá para decidir aqui, sem chamar a Evolution.
 */
export type UpsertGroup = GroupLike & {
  id: string;
  subject?: string;
  size?: number;
  isCommunity?: boolean;
  isCommunityAnnounce?: boolean;
  linkedParent?: string | null;
};

export type NovoGrupoRow = {
  whatsapp_group_id: string;
  name: string;
  members: number;
  is_admin: true;
  admins_total: number;
  admins_ours: number;
  admins_counted_at: string;
  community_jid: string | null;
  community_role: string | null;
};

export function gruposNovosDoUpsert(
  grupos: ReadonlyArray<UpsertGroup>,
  myPhone: string | null | undefined,
  ourPhones: (string | null | undefined)[],
  countedAt: string,
): NovoGrupoRow[] {
  return grupos
    .filter((g) => isAdminGroup(g, myPhone))
    .map((g) => {
      const tally = tallyAdmins(g.participants, ourPhones);
      const vinculo = classificarPapel(g);
      return {
        whatsapp_group_id: g.id,
        name: (g.subject ?? "").trim().slice(0, 200) || "Grupo sem nome",
        // Mesma regra do sync: a lista não inventa gente, então o maior vale.
        members: Math.max(
          typeof g.size === "number" && g.size >= 0 ? g.size : 0,
          g.participants?.length ?? 0,
        ),
        is_admin: true,
        admins_total: tally.total,
        admins_ours: tally.ours,
        admins_counted_at: countedAt,
        community_jid: vinculo.communityJid,
        community_role: vinculo.communityRole,
      };
    });
}
