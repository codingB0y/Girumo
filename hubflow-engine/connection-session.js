class ControllerStoppedError extends Error {
  constructor() {
    super("Connection session controller is stopped");
    this.name = "ControllerStoppedError";
  }
}

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
  let reconnectInFlight = null;
  let lifecycleToken = 0;
  let stopped = false;
  let shutdownPromise = null;
  const drainingSessions = new Set();

  function log(message, error) {
    const write = logger.error ?? logger.log;
    if (typeof write === "function") write.call(logger, message, error);
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
      get signal() {
        return this.abortController.signal;
      },
      isActive() {
        return current === this && !this.signal.aborted && this.state !== "closed";
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
      attempt = Promise.resolve()
        .then(() => {
          if (stopped || token !== lifecycleToken) return;
          return reconnect();
        })
        .catch((error) => log("reconnect failed", error))
        .finally(() => {
          if (reconnectInFlight === attempt) reconnectInFlight = null;
        });
      reconnectInFlight = attempt;
    }, delay);
    return true;
  }

  function scheduleReconnect(delay) {
    return scheduleReconnectForToken(delay, lifecycleToken);
  }

  async function recover(session, error, delay) {
    if (current !== session) return false;
    const token = session.lifecycleToken;
    closeSession(session);

    let timeoutHandle;
    const timeout = new Promise((resolve) => {
      timeoutHandle = setTimeoutFn(resolve, closeTimeoutMs);
    });
    try {
      await Promise.all([
        session.whenClosed(),
        Promise.race([
          Promise.resolve().then(() => session.sock?.end?.(error)).catch((endError) => {
            log("session close failed", endError);
          }),
          timeout,
        ]),
      ]);
    } finally {
      if (timeoutHandle !== undefined) clearTimeoutFn(timeoutHandle);
    }

    scheduleReconnectForToken(delay, token);
    return true;
  }

  async function initialize(session, { prepare, commit }) {
    if (!session.isActive()) return false;
    session.state = "initializing";
    try {
      const snapshot = await prepare(session.signal);
      if (!session.isActive()) return false;
      const commitResult = commit(snapshot, session);
      if (commitResult && typeof commitResult.then === "function") {
        Promise.resolve(commitResult).catch((commitError) =>
          log("asynchronous commit rejected", commitError),
        );
        throw new TypeError("connection session commit must be synchronous");
      }
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
    const token = session.lifecycleToken;
    closeSession(session);
    scheduleReconnectForToken(delay, token);
    return true;
  }

  function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    stopped = true;
    lifecycleToken++;
    if (reconnectTimer !== null) {
      clearTimeoutFn(reconnectTimer);
      reconnectTimer = null;
    }
    const session = current;
    if (session) closeSession(session);
    const drains = [...drainingSessions].map((candidate) => candidate.whenClosed());
    shutdownPromise = Promise.all(drains).then(() => {});
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

module.exports = { ControllerStoppedError, createConnectionSessionController };
