/**
 * ConnectionWatchdog — detecta conexões "zombi" (socket aberto mas stream morto).
 * Periodicamente envia um presence update ao WhatsApp; se falhar ou expirar o
 * timeout, força reconexão via sock.end() para que o handler de close reconecte.
 *
 * Uso:
 *   const wd = new ConnectionWatchdog({ sock, onDead: () => sock.end() });
 *   wd.start();
 *   // Na reconexão:
 *   wd.stop();
 *   wd = new ConnectionWatchdog({ sock: novoSock, ... });
 */
class ConnectionWatchdog {
  constructor({
    sock,
    onDead,
    intervalMs = 45_000,
    timeoutMs = 15_000,
    logger = console,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = {}) {
    this.sock = sock;
    this.onDead = onDead;
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this._setInterval = setIntervalFn;
    this._clearInterval = clearIntervalFn;
    this._setTimeout = setTimeoutFn;
    this._clearTimeout = clearTimeoutFn;
    this._timer = null;
    this._alive = true;
    this._consecutiveFails = 0;
    this._generation = 0;
    this._pingInFlight = null;
    this._cancelPing = null;
    this._maxFails = 3; // 3 falhas seguidas = conexão morta
  }

  start() {
    this.stop();
    this._alive = true;
    this._consecutiveFails = 0;
    this._timer = this._setInterval(() => this._ping(), this.intervalMs);
  }

  stop() {
    this._generation++;
    if (this._timer !== null) {
      this._clearInterval(this._timer);
      this._timer = null;
    }
    this._alive = false;
    if (this._cancelPing) this._cancelPing();
  }

  _ping() {
    if (!this._alive) return Promise.resolve();
    const generation = this._generation;
    if (this._pingInFlight?.generation === generation) return this._pingInFlight.promise;

    let inFlight;
    let cancelPing;
    const cancellation = new Promise((resolve) => {
      cancelPing = resolve;
    });
    this._cancelPing = cancelPing;
    const promise = (async () => {
      let timeoutHandle;
      try {
        // sendPresenceUpdate é leve e confirma que o stream está funcional.
        // Timeout manual garante que não ficamos presos esperando forever.
        await Promise.race([
          this.sock.sendPresenceUpdate("available"),
          new Promise((_, reject) => {
            timeoutHandle = this._setTimeout(
              () => reject(new Error("watchdog timeout")),
              this.timeoutMs
            );
          }),
          cancellation,
        ]);
        if (!this._alive || this._generation !== generation) return;
        this._consecutiveFails = 0;
      } catch (err) {
        if (!this._alive || this._generation !== generation) return;
        this._consecutiveFails++;
        this.logger.log(
          `🐕 Watchdog: ping falhou (${this._consecutiveFails}/${this._maxFails}): ${err.message}`
        );
        if (this._consecutiveFails >= this._maxFails) {
          this.logger.log("🐕 Watchdog: conexão zombi detectada. Forçando reconexão...");
          this.stop();
          if (this.onDead) {
            try {
              await this.onDead();
            } catch (onDeadError) {
              this.logger.log(`🐕 Watchdog: recuperação falhou: ${onDeadError.message}`);
            }
          }
        }
      } finally {
        if (timeoutHandle !== undefined) this._clearTimeout(timeoutHandle);
        if (this._cancelPing === cancelPing) this._cancelPing = null;
      }
    })();

    inFlight = { generation, promise };
    this._pingInFlight = inFlight;
    const cleanup = () => {
      if (this._pingInFlight === inFlight) this._pingInFlight = null;
    };
    promise.then(cleanup, cleanup);
    return promise;
  }
}

function createConnectionWatchdogManager({ Watchdog = ConnectionWatchdog, logger = console } = {}) {
  let active = null;

  function detach(sock) {
    if (!active || (sock && active.sock !== sock)) return false;
    active.watchdog.stop();
    active = null;
    return true;
  }

  function attach(sock) {
    if (!sock) throw new Error("Socket obrigatório para o watchdog.");
    if (active?.sock === sock) return active.watchdog;
    detach();
    let watchdog;
    watchdog = new Watchdog({
      sock,
      logger,
      onDead: () => {
        if (active?.sock !== sock || active.watchdog !== watchdog) return;
        return sock.end(new Error("watchdog detected zombie connection"));
      },
    });
    active = { sock, watchdog };
    watchdog.start();
    return watchdog;
  }

  return { attach, detach, stop: () => detach() };
}

function createConnectionLifecycleManager({
  reconnect,
  logger = console,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let latestSocket = null;
  let reconnectTimer = null;
  let stopped = false;

  function track(sock) {
    if (!sock) throw new Error("Socket obrigatório para o lifecycle.");
    latestSocket = sock;
  }

  function isLatest(sock) {
    return Boolean(latestSocket && latestSocket === sock);
  }

  function release(sock) {
    if (!isLatest(sock)) return false;
    latestSocket = null;
    return true;
  }

  function scheduleReconnect(delay) {
    if (stopped || reconnectTimer !== null) return false;
    reconnectTimer = setTimeoutFn(() => {
      reconnectTimer = null;
      Promise.resolve()
        .then(reconnect)
        .catch((error) => logger.log(`Erro ao reconectar: ${error?.message ?? error}`));
    }, delay);
    return true;
  }

  function shutdown() {
    stopped = true;
    latestSocket = null;
    if (reconnectTimer === null) return false;
    clearTimeoutFn(reconnectTimer);
    reconnectTimer = null;
    return true;
  }

  return { track, isLatest, release, scheduleReconnect, shutdown };
}

module.exports = {
  ConnectionWatchdog,
  createConnectionLifecycleManager,
  createConnectionWatchdogManager,
};
