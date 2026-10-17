import type { Carga } from "@/lib/painel/types";

/**
 * Busca UMA lista e reporta a carga dela separadamente.
 *
 * Duas coisas que a casca antiga não fazia, e que cada tela do painel pagou
 * de um jeito diferente:
 *
 * 1. **`r.ok` é checado.** `r.json()` direto transforma o corpo de um 500 em
 *    dado, e a tela diz "nenhuma campanha" para quem tem quarenta.
 * 2. **A carga é por rota.** O `.catch(() => [])` que virava lista vazia fazia
 *    uma falha em `/api/groups` imprimir "0 / 0 vagas" e uma em `/api/orders`
 *    imprimir "R$ 0,00" em Vendas — números inventados, com cara de medição.
 *
 * `cache: "no-store"` para que o botão "Tentar de novo" realmente vá à rede em
 * vez de servir a mesma resposta do cache do navegador.
 *
 * Devolve o que guardou (ou `null` na falha) para quem ainda precisa do valor
 * no mesmo fluxo — achar a campanha da tela na lista, por exemplo.
 */
export function buscarLista<T>(
  url: string,
  guardar: (itens: T[]) => void,
  marcar: (carga: Carga) => void,
): Promise<T[] | null> {
  return buscar(url, (corpo): corpo is T[] => Array.isArray(corpo), guardar, marcar);
}

/** Idem para qualquer forma: corpo que `valido` recusa é erro, nunca dado. */
export async function buscar<T>(
  url: string,
  valido: (corpo: unknown) => corpo is T,
  guardar: (valor: T) => void,
  marcar: (carga: Carga) => void,
): Promise<T | null> {
  marcar("carregando");
  try {
    const resposta = await fetch(url, { cache: "no-store" });
    if (!resposta.ok) {
      marcar("erro");
      return null;
    }
    const corpo: unknown = await resposta.json();
    if (!valido(corpo)) {
      marcar("erro");
      return null;
    }
    guardar(corpo);
    marcar("ok");
    return corpo;
  } catch {
    marcar("erro");
    return null;
  }
}

/**
 * A carga de uma tela que só faz sentido com TODAS as consultas: uma falha já
 * é erro (esperar as outras só adia o "Tentar de novo"), e ok só com todas ok.
 */
export function cargaDeTodas(cargas: readonly Carga[]): Carga {
  if (cargas.includes("erro")) return "erro";
  if (cargas.includes("carregando")) return "carregando";
  return "ok";
}
