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
 */
export async function buscarLista<T>(
  url: string,
  guardar: (itens: T[]) => void,
  marcar: (carga: Carga) => void,
): Promise<void> {
  marcar("carregando");
  try {
    const resposta = await fetch(url, { cache: "no-store" });
    if (!resposta.ok) {
      marcar("erro");
      return;
    }
    const corpo: unknown = await resposta.json();
    if (!Array.isArray(corpo)) {
      marcar("erro");
      return;
    }
    guardar(corpo as T[]);
    marcar("ok");
  } catch {
    marcar("erro");
  }
}
