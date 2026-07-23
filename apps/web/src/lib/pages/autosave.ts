export type AutosaveCoordinator<T> = {
  schedule(value: T): void;
  flush(): Promise<void>;
  runAfterFlush<R>(action: () => Promise<R>): Promise<R>;
  dispose(): void;
};

export type AutosaveCoordinatorOptions<T> = {
  delayMs: number;
  save: (value: T) => Promise<void>;
  scheduleTimer?: (callback: () => void, delayMs: number) => unknown;
  cancelTimer?: (handle: unknown) => void;
};

/**
 * Coordenador serial e coalescente do editor. Existe uma única fila para
 * autosaves e ações de status: o valor pendente mais recente substitui os
 * intermediários, e publish/pause só entra na fila depois de drenar esse valor.
 */
export function createAutosaveCoordinator<T>({
  delayMs,
  save,
  scheduleTimer = (callback, delay) => setTimeout(callback, delay),
  cancelTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: AutosaveCoordinatorOptions<T>): AutosaveCoordinator<T> {
  let pending: { value: T } | null = null;
  let timerHandle: unknown | null = null;
  let disposed = false;
  let tail: Promise<void> = Promise.resolve();

  function cancelPendingTimer(): void {
    if (timerHandle === null) return;
    cancelTimer(timerHandle);
    timerHandle = null;
  }

  async function drainPending(): Promise<void> {
    while (!disposed && pending) {
      const current = pending;
      pending = null;
      try {
        await save(current.value);
      } catch (error) {
        // Falha não autoriza uma ação de status. Restaura o valor que falhou
        // apenas se uma edição mais nova ainda não o substituiu.
        if (!pending) pending = current;
        throw error;
      }
    }
  }

  function enqueue<R>(operation: () => Promise<R>): Promise<R> {
    const result = tail.then(operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function enqueueAutomaticFlush(): void {
    void enqueue(drainPending).catch(() => {
      // O callback de save comunica o erro à UI. A fila permanece utilizável e
      // mantém o valor para retry explícito ou a próxima edição.
    });
  }

  return {
    schedule(value) {
      if (disposed) return;
      pending = { value };
      cancelPendingTimer();
      timerHandle = scheduleTimer(() => {
        timerHandle = null;
        enqueueAutomaticFlush();
      }, delayMs);
    },

    flush() {
      if (disposed) return Promise.resolve();
      cancelPendingTimer();
      return enqueue(drainPending);
    },

    runAfterFlush<R>(action: () => Promise<R>): Promise<R> {
      if (disposed) return Promise.reject(new Error("Autosave encerrado."));
      cancelPendingTimer();
      return enqueue(async () => {
        await drainPending();
        return action();
      });
    },

    dispose() {
      disposed = true;
      cancelPendingTimer();
      pending = null;
    },
  };
}
