/**
 * Posts de hoje por grupo (`GET /api/groups/posts-hoje`), contra o teto do dia.
 * O teto vem do banco (`app.posts_por_grupo_dia()`); a tela só o repete e nunca
 * guarda o número. Grupo sem post hoje não aparece em `grupos`.
 */
export type PostsHoje = { teto: number; grupos: Readonly<Record<string, number>> };

function ehInteiro(valor: unknown, minimo: number): valor is number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= minimo;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Confere o corpo de `posts_hoje_por_grupo` / `GET /api/groups/posts-hoje`: teto inteiro
 * maior que zero e `grupos` com contagens inteiras não negativas. Fora do formato é
 * `null`: a tela prefere não mostrar a linha a mostrar uma contagem que o banco não deu.
 * Um só lugar para o servidor (que lança) e o cliente (que some com a linha).
 */
export function lerFormatoPostsHoje(dados: unknown): PostsHoje | null {
  if (!ehObjeto(dados) || !ehInteiro(dados.teto, 1) || !ehObjeto(dados.grupos)) return null;
  const grupos: Record<string, number> = {};
  for (const [jid, quantos] of Object.entries(dados.grupos)) {
    if (!ehInteiro(quantos, 0)) return null;
    grupos[jid] = quantos;
  }
  return { teto: dados.teto, grupos };
}

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
