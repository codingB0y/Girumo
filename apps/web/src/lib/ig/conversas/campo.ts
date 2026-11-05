/** Regra pura do campo de resposta (spec §7.8): a barra `/` das respostas prontas. Sem React, sem rede. */

export type RespostaPronta = { id: string; titulo: string; texto: string };

const normalizar = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** `/` no começo abre a lista e o resto filtra; `null` = fechada. Quebra de linha fecha: já é uma mensagem. */
export function consultaDaBarra(texto: string): string | null {
  if (!texto.startsWith("/") || texto.includes("\n")) return null;
  return texto.slice(1);
}

/** Filtra pelo título (sem caixa nem acento); o corpo da resposta não entra na busca. */
export function filtrarRespostas(lista: readonly RespostaPronta[], consulta: string): RespostaPronta[] {
  const q = normalizar(consulta.trim());
  return q ? lista.filter((r) => normalizar(r.titulo).includes(q)) : [...lista];
}

/** Item ativo depois de uma seta. Dão a volta; lista vazia = -1. */
export function moverAtivo(atual: number, tecla: "ArrowDown" | "ArrowUp", total: number): number {
  if (total <= 0) return -1;
  const base = atual >= 0 && atual < total ? atual : -1;
  if (tecla === "ArrowUp") return base <= 0 ? total - 1 : base - 1;
  return base + 1 >= total ? 0 : base + 1;
}

export type CampanhaDoConvite = { id: string; nome: string };

/**
 * As campanhas que o convite oferece, da resposta de `GET /api/campanhas`. O painel não tem um "ativa" para a
 * campanha: vale o que o editor de fluxos também usa, ter link (`slug`). Entrada torta é descartada.
 */
export function campanhasParaConvite(lista: unknown): CampanhaDoConvite[] {
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((c: unknown) => {
    const o = (c ?? {}) as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.slug !== "string" || !o.slug) return [];
    return [{ id: o.id, nome: typeof o.name === "string" && o.name ? o.name : o.slug }];
  });
}
