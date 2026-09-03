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

export function startLoop(opts: LoopOptions): { done: Promise<void> } {
  const done = (async () => {
    while (!opts.isStopping()) {
      try {
        await opts.tick();
      } catch (err) {
        opts.onError(err);
      }
      if (opts.isStopping()) break;
      await sleep(opts.intervalMs);
    }
  })();
  return { done };
}
