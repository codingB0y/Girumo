/**
 * Papel de um grupo dentro de uma comunidade nativa do WhatsApp.
 *
 * A Evolution 2.3.7 repassa os campos do `GroupMetadata` do Baileys sem
 * filtrar — medido em 17/09/2026 contra produção, ver
 * `docs/superpowers/specs/2026-09-17-comunidade-nativa-leitura-design.md` §2.1.
 * O grupo-pai traz `isCommunity`, o de Avisos traz `isCommunityAnnounce`, e
 * todo filho traz `linkedParent` com o JID do pai.
 */
export type PapelComunidade = "parent" | "announce" | "member";

export type GrupoComunidadeRef = {
  id: string;
  isCommunity?: boolean;
  isCommunityAnnounce?: boolean;
  linkedParent?: string | null;
};

export type VinculoComunidade = {
  communityJid: string | null;
  communityRole: PapelComunidade | null;
};

const SEM_VINCULO: VinculoComunidade = { communityJid: null, communityRole: null };

export function classificarPapel(g: GrupoComunidadeRef): VinculoComunidade {
  // O pai é testado primeiro porque ele não tem `linkedParent`: ele É o parent.
  if (g.isCommunity) return { communityJid: g.id, communityRole: "parent" };

  // Sem pai declarado não há comunidade, nem que o grupo se diga Avisos. Um
  // "announce" órfão seria um vínculo apontando para lugar nenhum.
  const pai = g.linkedParent?.trim();
  if (!pai) return SEM_VINCULO;

  return { communityJid: pai, communityRole: g.isCommunityAnnounce ? "announce" : "member" };
}
