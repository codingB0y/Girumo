class ControllerStoppedError extends Error {
  constructor() {
    super("Connection session controller is stopped");
    this.name = "ControllerStoppedError";
  }
}

class SessionAbortedError extends Error {
  constructor(generation) {
    super(`Connection session ${generation} is no longer active`);
    this.name = "SessionAbortedError";
    this.generation = generation;
  }
}

const ABORTED = Symbol("aborted");

function createConnectionSessionController({
  reconnect,
  getRetryDelay,
  closeTimeoutMs = 10_000,
  logger = console,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let generation = 0;
  let current = null;
  let reconnectTimer = null;
  let reconnectInFlight = null;
  let lifecycleToken = 0;
  let stopped = false;
  let shutdownPromise = null;
  const drainingSessions = new Set();
  const controlledOperations = new Set();
  const controllerAbortController = new AbortController();

  function log(message, error) {
    const write = logger.error ?? logger.log;
    if (typeof write === "function") write.call(logger, message, error);
  }

  function raceWithAbort(promise, signals) {
    const observed = Promise.resolve(promise);
    return new Promise((resolve, reject) => {
      let settled = false;
      const listeners = [];
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        for (const [signal, listener] of listeners) {
          signal.removeEventListener("abort", listener);
        }
        callback(value);
      };

      observed.then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error),
      );
      for (const signal of signals) {
        const onAbort = () => finish(resolve, ABORTED);
        if (signal.aborted) {
          finish(resolve, ABORTED);
          break;
        }
        listeners.push([signal, onAbort]);
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }

  function trackOperation(operation) {
    const tracked = Promise.resolve(operation);
    controlledOperations.add(tracked);
    const release = () => controlledOperations.delete(tracked);
    tracked.then(release, release);
    return tracked;
  }

  function invokeCleanup(cleanup) {
    try {
      const result = cleanup();
      if (result && typeof result.then === "function") {
        return Promise.resolve(result).catch((error) => log("session cleanup failed", error));
      }
    } catch (error) {
      log("session cleanup failed", error);
    }
    return null;
  }

  function setCleanupDrain(session, drain, markClosed = true) {
    let finalPromise;
    finalPromise = Promise.resolve(drain).then(() => {
      if (session.cleanupPromise === finalPromise) {
        if (markClosed) session.state = "closed";
        drainingSessions.delete(session);
      }
    });
    session.cleanupPromise = finalPromise;
    drainingSessions.add(session);
  }

  function addCleanup(session, cleanup) {
    if (session.state !== "closing" && session.state !== "closed") {
      session.cleanups.push(cleanup);
      return cleanup;
    }

    const result = invokeCleanup(cleanup);
    if (result) {
      const combined = Promise.all([session.cleanupPromise, result]);
      if (session.state === "closing") setCleanupDrain(session, combined);
      else setCleanupDrain(session, combined, false);
    }
    return cleanup;
  }

  function closeSession(session) {
    if (!session || session.state === "closing" || session.state === "closed") return false;
    session.state = "closing";
    session.abortController.abort();
    if (current === session) current = null;
    let drain = null;
    for (const cleanup of session.cleanups.splice(0).reverse()) {
      if (drain) drain = drain.then(() => invokeCleanup(cleanup));
      else drain = invokeCleanup(cleanup);
    }
    if (drain) setCleanupDrain(session, drain);
    else session.state = "closed";
    return true;
  }

  function create(sock) {
    if (stopped) throw new ControllerStoppedError();
    lifecycleToken++;
    if (reconnectTimer !== null) {
      clearTimeoutFn(reconnectTimer);
      reconnectTimer = null;
    }
    if (current) closeSession(current);
    const session = {
      generation: ++generation,
      lifecycleToken,
      sock,
      state: "connecting",
      abortController: new AbortController(),
      cleanups: [],
      cleanupPromise: Promise.resolve(),
      initializationPromise: null,
      get signal() {
        return this.abortController.signal;
      },
      isActive() {
        return current === this && !this.signal.aborted && this.state !== "closed";
      },
      assertActive() {
        if (!this.isActive()) throw new SessionAbortedError(this.generation);
        return this;
      },
      guard(handler) {
        return (...args) => {
          if (!this.isActive()) return undefined;
          return handler(...args);
        };
      },
      guardAsync(handler) {
        return async (...args) => {
          if (!this.isActive()) return undefined;
          try {
            const result = await handler(...args);
            if (!this.isActive()) return undefined;
            return result;
          } catch (error) {
            if (error instanceof SessionAbortedError || !this.isActive()) return undefined;
            throw error;
          }
        };
      },
      addCleanup(cleanup) {
        return addCleanup(this, cleanup);
      },
      whenClosed() {
        const observed = this.cleanupPromise;
        return Promise.resolve(observed).then(() =>
          observed === this.cleanupPromise ? undefined : this.whenClosed(),
        );
      },
    };
    current = session;
    return session;
  }

  function scheduleReconnectForToken(delay, token) {
    if (
      stopped ||
      token !== lifecycleToken ||
      reconnectTimer !== null ||
      reconnectInFlight !== null
    ) {
      return false;
    }
    reconnectTimer = setTimeoutFn(() => {
      reconnectTimer = null;
      if (stopped || token !== lifecycleToken) return;
      let attempt;
      // reconnect(signal) must honor the signal before externally visible effects.
      // Cancellation settles this controller's wrapper but cannot undo effects from a callback.
      let wrapperSettled = false;
      const external = Promise.resolve().then(() => {
        if (stopped || token !== lifecycleToken) return ABORTED;
        return reconnect(controllerAbortController.signal);
      });
      const observedExternal = external.then(
        (value) => ({ ok: true, value }),
        (error) => {
          if (wrapperSettled) log("reconnect failed", error);
          return { ok: false, error };
        },
      );
      attempt = trackOperation(
        raceWithAbort(observedExternal, [controllerAbortController.signal]),
      );
      const release = () => {
        if (reconnectInFlight === attempt) reconnectInFlight = null;
      };
      attempt.then((outcome) => {
        wrapperSettled = true;
        release();
        if (outcome === ABORTED || outcome.ok) return;
        log("reconnect failed", outcome.error);
        if (stopped || token !== lifecycleToken || typeof getRetryDelay !== "function") return;
        let delay;
        try {
          delay = getRetryDelay(outcome.error);
        } catch (delayError) {
          log("failed to calculate reconnect retry delay", delayError);
          return;
        }
        if (Number.isFinite(delay) && delay >= 0) scheduleReconnectForToken(delay, token);
      });
      reconnectInFlight = attempt;
    }, delay);
    return true;
  }

  function scheduleReconnect(delay) {
    return scheduleReconnectForToken(delay, lifecycleToken);
  }

  function recover(session, error, delay) {
    return trackOperation(recoverControlled(session, error, delay));
  }

  async function recoverControlled(session, error, delay) {
    if (current !== session) return false;
    const token = session.lifecycleToken;
    closeSession(session);

    let timeoutHandle;
    const timeout = new Promise((resolve) => {
      timeoutHandle = setTimeoutFn(resolve, closeTimeoutMs);
    });
    const ending = Promise.resolve()
      .then(() => {
        if (controllerAbortController.signal.aborted) return ABORTED;
        return session.sock?.end?.(error);
      })
      .catch((endError) => {
        log("session close failed", endError);
      });
    try {
      await raceWithAbort(
        Promise.race([
          ending,
          timeout,
        ]),
        [controllerAbortController.signal],
      );
    } finally {
      if (timeoutHandle !== undefined) clearTimeoutFn(timeoutHandle);
    }
    await session.whenClosed();

    scheduleReconnectForToken(delay, token);
    return true;
  }

  function initialize(session, options) {
    if (!session.isActive()) return Promise.resolve(false);
    if (session.state === "ready") return Promise.resolve(true);
    if (session.initializationPromise) return session.initializationPromise;
    const operation = trackOperation(initializeControlled(session, options));
    session.initializationPromise = operation;
    const release = () => {
      if (session.initializationPromise === operation && session.state !== "ready") {
        session.initializationPromise = null;
      }
    };
    operation.then(release, release);
    return operation;
  }

  async function initializeControlled(session, { prepare, commit, getRecoveryDelay = () => 0 }) {
    if (!session.isActive()) return false;
    session.state = "initializing";
    try {
      const preparing = Promise.resolve().then(() => {
        if (session.signal.aborted || controllerAbortController.signal.aborted) return ABORTED;
        return prepare(session.signal);
      });
      const snapshot = await raceWithAbort(preparing, [
        session.signal,
        controllerAbortController.signal,
      ]);
      if (snapshot === ABORTED) return false;
      if (!session.isActive()) return false;
      // O commit é síncrono; publicar ready aqui permite que os recursos criados
      // por ele (watchdog/timers/worker) validem o estado sem abrir uma janela assíncrona.
      session.state = "ready";
      const commitResult = commit(snapshot, session);
      if (commitResult && typeof commitResult.then === "function") {
        Promise.resolve(commitResult).catch((commitError) =>
          log("asynchronous commit rejected", commitError),
        );
        throw new TypeError("connection session commit must be synchronous");
      }
      if (!session.isActive()) return false;
      return true;
    } catch (error) {
      if (session.isActive()) {
        let recoveryDelay = 0;
        try {
          recoveryDelay = getRecoveryDelay(error);
        } catch (delayError) {
          log("failed to calculate initialization recovery delay", delayError);
        }
        await recover(session, error, recoveryDelay);
      }
      return false;
    }
  }

  function handleClose(session, delay) {
    return trackOperation(handleCloseControlled(session, delay));
  }

  async function handleCloseControlled(session, delay) {
    if (current !== session) return false;
    const token = session.lifecycleToken;
    closeSession(session);
    await session.whenClosed();
    scheduleReconnectForToken(delay, token);
    return true;
  }

  function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    stopped = true;
    lifecycleToken++;
    controllerAbortController.abort();
    if (reconnectTimer !== null) {
      clearTimeoutFn(reconnectTimer);
      reconnectTimer = null;
    }
    const session = current;
    if (session) closeSession(session);
    shutdownPromise = (async () => {
      while (controlledOperations.size > 0 || drainingSessions.size > 0) {
        const operations = [...controlledOperations];
        const drains = [...drainingSessions].map((candidate) => candidate.whenClosed());
        await Promise.all([...operations, ...drains]);
      }
    })();
    return shutdownPromise;
  }

  return {
    create,
    handleClose,
    initialize,
    recover,
    scheduleReconnect,
    shutdown,
  };
}

module.exports = {
  ControllerStoppedError,
  SessionAbortedError,
  createConnectionSessionController,
};
