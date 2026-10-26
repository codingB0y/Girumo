/**
 * Posts de hoje por grupo (`GET /api/groups/posts-hoje`), contra o teto do dia.
 * O teto vem do banco (`app.posts_por_grupo_dia()`); a tela só o repete e nunca
 * guarda o número. Grupo sem post hoje não aparece em `grupos`.
 */
export type PostsHoje = { teto: number; grupos: Readonly<Record<string, number>> };

export type TomDaLinha = "info" | "aviso" | "erro";
export type LinhaDosPostsHoje = { texto: string; tom: TomDaLinha };

/**
 * A linha acima do botão de postar (spec teto-posts-por-grupo, "No compositor").
 * `grupos` é a mesma lista que o botão conta. Grupo ausente de `dados.grupos`
 * conta 0, e contagem acima do teto vale como "no teto". Nenhum com post hoje: sem linha.
 */
export function linhaDosPostsHoje(
  dados: PostsHoje,
  grupos: readonly string[],
): LinhaDosPostsHoje | null {
  const { teto } = dados;
  const contagens = grupos.map((jid) => dados.grupos[jid] ?? 0);
  const max = Math.max(0, ...contagens);
  if (max === 0) return null;

  const n = contagens.length;
  const k = contagens.filter((c) => c >= teto).length;
  if (k === 0) return { texto: `Hoje: até ${max} de ${teto} posts nestes grupos.`, tom: "info" };
  if (k < n) {
    return {
      texto: `${k} de ${n} grupos já receberam ${teto} posts hoje e vão ficar de fora.`,
      tom: "aviso",
    };
  }
  return {
    texto: `Todos estes grupos já receberam ${teto} posts hoje. O post não vai sair; o limite volta à meia-noite.`,
    tom: "erro",
  };
}
