/**
 * Um loop por trabalho. Antes, envio, lote, grow e manutenção rodavam em série
 * dentro de um único `while` com sleep(pollMs): uma foto de grupo (3,5 s na
 * Evolution) + claim por HTTP + sleep segurava o envio de todos os tenants, e a
 * cadência efetiva do lote era 1 op a cada 8-16 s, não 4 s (medido em 03/09).
 *
 * `tick` nunca reentra: o próximo só agenda depois que o anterior resolve.
 * O intervalo é entre o FIM de um tick e o INÍCIO do próximo.
 */
export type LoopOptions = {
  name: string;
  intervalMs: number;
  tick: () => Promise<void>;
  isStopping: () => boolean;
  onError: (err: unknown) => void;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SLEEP_STEP_MS = 100;

/**
 * Sleep fatiado em passos curtos, checando `isStopping` a cada um. Sem isso o
 * loop `grow` (5 min de intervalo) faria o shutdown esperar até 5 min pelo
 * `sleep` em andamento — `Promise.all` em `index.ts` espera o mais lento, e
 * `drainInFlight()` só roda depois dele.
 */
async function interruptibleSleep(ms: number, isStopping: () => boolean): Promise<void> {
  let remaining = ms;
  while (remaining > 0 && !isStopping()) {
    await sleep(Math.min(SLEEP_STEP_MS, remaining));
    remaining -= SLEEP_STEP_MS;
  }
}

export function startLoop(opts: LoopOptions): { done: Promise<void> } {
  const done = (async () => {
    while (!opts.isStopping()) {
      try {
        await opts.tick();
      } catch (err) {
        opts.onError(err);
      }
      if (opts.isStopping()) break;
      await interruptibleSleep(opts.intervalMs, opts.isStopping);
    }
  })();
  return { done };
}
