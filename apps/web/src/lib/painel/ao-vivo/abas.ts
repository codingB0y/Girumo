/** As três abas da Início "Ao vivo" no celular (spec 2026-10-02, PR 6). */
export type Aba = "relampago" | "postando" | "grupos";
export const ABAS: readonly Aba[] = ["relampago", "postando", "grupos"];

/** Valor de `?aba=`: só as três abas valem; qualquer outra coisa cai na regra da aba inicial. */
export function abaDaUrl(valor: string | null): Aba | null {
  return ABAS.find((a) => a === valor) ?? null;
}

/** Quem pede atenção primeiro: oferta no ar, depois post saindo, senão o mapa. */
export function abaInicial(e: { relampagoNoAr: boolean; postSaindo: boolean }): Aba {
  if (e.relampagoNoAr) return "relampago";
  return e.postSaindo ? "postando" : "grupos";
}

export type ContadoresDasAbas = Record<Aba, string | null>;

export function contadoresDasAbas(e: {
  relampagoNoAr: boolean;
  /** Pessoas esperando na fila; null quando a fila não carregou. */
  esperando: number | null;
  post: { entregues: number; total: number; saindo: boolean } | null;
  grupos: number;
}): ContadoresDasAbas {
  return {
    relampago: !e.relampagoNoAr ? null : e.esperando === null ? "●" : String(e.esperando),
    postando: e.post?.saindo ? `${e.post.entregues}/${e.post.total}` : null,
    grupos: e.grupos > 0 ? String(e.grupos) : null,
  };
}
