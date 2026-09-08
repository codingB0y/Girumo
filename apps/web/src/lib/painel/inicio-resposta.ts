/**
 * Envelope da carga agregada da Inicio.
 *
 * Cada parte carrega o proprio `ok` porque a tela distingue tres coisas que um
 * array vazio nao distingue: veio vazio, nao deu pra buscar, e nem tentou. Com
 * as dez chamadas separadas isso vinha de graca (cada `fetch` tinha seu status);
 * numa resposta so, precisa ser dito.
 */
export type Parte<T> = { ok: true; data: T } | { ok: false };

type Tarefas = Record<string, () => Promise<unknown>>;

export type Partes<T extends Tarefas> = {
  [K in keyof T]: Parte<Awaited<ReturnType<T[K]>>>;
};

/**
 * Roda todas as tarefas em paralelo e devolve uma parte por chave.
 *
 * Casa resultado com chave, e nao com posicao: com dez listas do mesmo formato
 * (array), trocar duas num destructuring de `Promise.allSettled` compila,
 * passa no lint e entrega os leads no lugar dos links.
 *
 * `allSettled`, nunca `all`: uma parte que falha vira `ok:false` e a tela decide
 * o que fazer — com `all`, a primeira rejeicao levaria as outras nove junto.
 */
export async function resolverPartes<T extends Tarefas>(tarefas: T): Promise<Partes<T>> {
  const chaves = Object.keys(tarefas) as (keyof T & string)[];
  const resultados = await Promise.allSettled(chaves.map((chave) => tarefas[chave]()));

  const partes = {} as Partes<T>;
  chaves.forEach((chave, i) => {
    const resultado = resultados[i];
    partes[chave] = (
      resultado.status === "fulfilled" ? { ok: true, data: resultado.value } : { ok: false }
    ) as Partes<T>[typeof chave];
  });
  return partes;
}
