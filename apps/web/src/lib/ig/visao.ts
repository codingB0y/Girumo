export type Visao = "passo" | "mapa";
export const CHAVE_VISAO = "ig.visao";
type Store = Pick<Storage, "getItem" | "setItem">;

const ehVisao = (v: unknown): v is Visao => v === "passo" || v === "mapa";

/** "Abre na última que você usou": a query (`?ver=`) ganha, depois o navegador, depois o padrão. */
export function lerVisao(store: Store | null, query: string | null): Visao {
  if (ehVisao(query)) return query;
  try {
    const guardada = store?.getItem(CHAVE_VISAO);
    if (ehVisao(guardada)) return guardada;
  } catch {
    /* storage bloqueado: segue o padrão */
  }
  return "passo";
}

export function guardarVisao(store: Store | null, visao: Visao): void {
  try {
    store?.setItem(CHAVE_VISAO, visao);
  } catch {
    /* storage bloqueado: a visão vale só nesta aba */
  }
}
