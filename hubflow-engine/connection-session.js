function createConnectionSessionController({
  reconnect,
  closeTimeoutMs = 10_000,
  logger = console,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let generation = 0;
  let current = null;
  let reconnectTimer = null;
  let stopped = false;

  function log(message, error) {
    const write = logger.error ?? logger.log;
    if (typeof write === "function") write.call(logger, message, error);
  }

  function closeSession(session) {
    if (!session || session.state === "closed") return false;
    session.state = "closing";
    session.abortController.abort();
    for (const cleanup of session.cleanups.splice(0).reverse()) {
      try {
        const result = cleanup();
        if (result && typeof result.then === "function") {
          Promise.resolve(result).catch((error) => log("session cleanup failed", error));
        }
      } catch (error) {
        log("session cleanup failed", error);
      }
    }
    session.state = "closed";
    if (current === session) current = null;
    return true;
  }

  function create(sock) {
    if (current) closeSession(current);
    const session = {
      generation: ++generation,
      sock,
      state: "connecting",
      abortController: new AbortController(),
      cleanups: [],
      get signal() {
        return this.abortController.signal;
      },
      isActive() {
        return current === this && !this.signal.aborted && this.state !== "closed";
      },
      addCleanup(cleanup) {
        this.cleanups.push(cleanup);
        return cleanup;
      },
    };
    current = session;
    return session;
  }

  function scheduleReconnect(delay) {
    if (stopped || reconnectTimer !== null) return false;
    reconnectTimer = setTimeoutFn(() => {
      reconnectTimer = null;
      Promise.resolve()
        .then(reconnect)
        .catch((error) => log("reconnect failed", error));
    }, delay);
    return true;
  }

  async function recover(session, error, delay) {
    if (current !== session) return false;
    closeSession(session);

    let timeoutHandle;
    const timeout = new Promise((resolve) => {
      timeoutHandle = setTimeoutFn(resolve, closeTimeoutMs);
    });
    try {
      await Promise.race([
        Promise.resolve().then(() => session.sock?.end?.(error)).catch((endError) => {
          log("session close failed", endError);
        }),
        timeout,
      ]);
    } finally {
      if (timeoutHandle !== undefined) clearTimeoutFn(timeoutHandle);
    }

    scheduleReconnect(delay);
    return true;
  }

  async function initialize(session, { prepare, commit }) {
    if (!session.isActive()) return false;
    session.state = "initializing";
    try {
      const snapshot = await prepare(session.signal);
      if (!session.isActive()) return false;
      await commit(snapshot, session);
      if (!session.isActive()) return false;
      session.state = "ready";
      return true;
    } catch (error) {
      if (session.isActive()) await recover(session, error, 0);
      return false;
    }
  }

  function handleClose(session, delay) {
    if (current !== session) return false;
    closeSession(session);
    scheduleReconnect(delay);
    return true;
  }

  function shutdown() {
    stopped = true;
    if (reconnectTimer !== null) {
      clearTimeoutFn(reconnectTimer);
      reconnectTimer = null;
    }
    if (current) closeSession(current);
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

module.exports = { createConnectionSessionController };
