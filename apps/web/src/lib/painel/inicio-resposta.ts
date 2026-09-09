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
 * Quanto uma parte pode demorar antes de ser dada por perdida.
 *
 * Precisa ficar abaixo do limite de duracao da funcao serverless: se a
 * plataforma matar a invocacao primeiro, nao sobra resposta nenhuma para
 * mandar, e a tela inteira vira erro. Os stores medidos ficam entre 0,5 s e
 * 1,5 s, entao 8 s e folgado para o caso normal e curto para o caso travado.
 */
const TETO_PADRAO_MS = 8_000;

/**
 * Desiste da tarefa passado o teto.
 *
 * `Promise.allSettled` protege contra tarefa que REJEITA, nao contra tarefa que
 * demora: sem isto, um store pendurado segura a resposta inteira ate a
 * plataforma matar a invocacao. Antes da agregacao isso nao existia — cada rota
 * tinha a propria invocacao, entao um store travado derrubava so a parte dele e
 * a tela abria em modo parcial. O teto devolve esse comportamento.
 */
function comTeto<T>(tarefa: () => Promise<T>, tetoMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const desistir = new Promise<never>((_, rejeita) => {
    timer = setTimeout(() => rejeita(new Error(`parte passou de ${tetoMs} ms`)), tetoMs);
  });
  // `finally` limpa o timer nos dois desfechos: pendente, ele segura o event
  // loop e atrasa o encerramento da funcao mesmo com a resposta ja pronta.
  return Promise.race([tarefa(), desistir]).finally(() => clearTimeout(timer));
}

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
export async function resolverPartes<T extends Tarefas>(
  tarefas: T,
  opcoes: { tetoMs?: number } = {},
): Promise<Partes<T>> {
  const tetoMs = opcoes.tetoMs ?? TETO_PADRAO_MS;
  const chaves = Object.keys(tarefas) as (keyof T & string)[];
  const resultados = await Promise.allSettled(
    chaves.map((chave) => comTeto(tarefas[chave], tetoMs)),
  );

  const partes = {} as Partes<T>;
  chaves.forEach((chave, i) => {
    const resultado = resultados[i];
    partes[chave] = (
      resultado.status === "fulfilled" ? { ok: true, data: resultado.value } : { ok: false }
    ) as Partes<T>[typeof chave];
  });
  return partes;
}
