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
  constructor({ sock, onDead, intervalMs = 45_000, timeoutMs = 15_000, logger = console } = {}) {
    this.sock = sock;
    this.onDead = onDead;
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this._timer = null;
    this._alive = true;
    this._consecutiveFails = 0;
    this._maxFails = 3; // 3 falhas seguidas = conexão morta
  }

  start() {
    this.stop();
    this._alive = true;
    this._consecutiveFails = 0;
    this._timer = setInterval(() => this._ping(), this.intervalMs);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._alive = false;
  }

  async _ping() {
    if (!this._alive) return;
    try {
      // sendPresenceUpdate é leve e confirma que o stream está funcional.
      // Timeout manual garante que não ficamos presos esperando forever.
      await Promise.race([
        this.sock.sendPresenceUpdate("available"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("watchdog timeout")), this.timeoutMs)
        ),
      ]);
      this._consecutiveFails = 0;
    } catch (err) {
      this._consecutiveFails++;
      this.logger.log(
        `🐕 Watchdog: ping falhou (${this._consecutiveFails}/${this._maxFails}): ${err.message}`
      );
      if (this._consecutiveFails >= this._maxFails) {
        this.logger.log("🐕 Watchdog: conexão zombi detectada. Forçando reconexão...");
        this.stop();
        if (this.onDead) this.onDead();
      }
    }
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
        sock.end(new Error("watchdog detected zombie connection"));
      },
    });
    active = { sock, watchdog };
    watchdog.start();
    return watchdog;
  }

  return { attach, detach, stop: () => detach() };
}

module.exports = { ConnectionWatchdog, createConnectionWatchdogManager };
