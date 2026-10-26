/**
 * Posts de hoje por grupo (`GET /api/groups/posts-hoje`), contra o teto do dia.
 * O teto vem do banco (`app.posts_por_grupo_dia()`); a tela só o repete e nunca
 * guarda o número. Grupo sem post hoje não aparece em `grupos`.
 */
export type PostsHoje = { teto: number; grupos: Readonly<Record<string, number>> };
