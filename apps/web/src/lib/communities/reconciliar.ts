import type { PapelComunidade } from "./papel";

export type GrupoClassificado = {
  whatsappGroupId: string;
  nome: string;
  isAdmin: boolean;
  communityJid: string | null;
  communityRole: PapelComunidade | null;
};

export type ComunidadeNativa = {
  communityJid: string;
  nome: string;
  /** O grupo onde o disparo único acontece. NULL quando não achamos o Avisos. */
  avisoGroupId: string | null;
  /** Só os filhos comuns — o pai e o Avisos ficam de fora. */
  memberGroupIds: string[];
};

/**
 * Agrupa grupos já classificados nas comunidades nativas que o tenant
 * realmente administra.
 *
 * O filtro de admin não é cosmético: o número principal é membro de 14
 * comunidades, a maioria de terceiros (GLA, TINTIM, CPA CHINÊS…). Sem ele a
 * tela do lojista encheria de comunidade alheia que ele não controla.
 */
export function comunidadesNativas(grupos: GrupoClassificado[]): ComunidadeNativa[] {
  const porJid = new Map<string, GrupoClassificado[]>();
  for (const g of grupos) {
    if (!g.communityJid || !g.communityRole) continue;
    const atual = porJid.get(g.communityJid);
    if (atual) atual.push(g);
    else porJid.set(g.communityJid, [g]);
  }

  const saida: ComunidadeNativa[] = [];
  for (const [communityJid, doJid] of porJid) {
    if (!doJid.some((g) => g.isAdmin)) continue;

    const pai = doJid.find((g) => g.communityRole === "parent");
    const aviso = doJid.find((g) => g.communityRole === "announce");
    // Sem pai nem Avisos não há quem batize a comunidade — o sync já filtrou
    // por admin antes de gravar, então um tenant que só administra filhos
    // nunca teria essas duas linhas. `dono` também é o guard: se nenhum dos
    // dois existe, pulamos antes de montar a saída.
    const dono = pai ?? aviso;
    if (!dono) continue;
    saida.push({
      communityJid,
      nome: dono.nome,
      avisoGroupId: aviso?.whatsappGroupId ?? null,
      memberGroupIds: doJid
        .filter((g) => g.communityRole === "member")
        .map((g) => g.whatsappGroupId),
    });
  }
  return saida;
}
