const assert = require("node:assert/strict");
const test = require("node:test");

const { ConnectionWatchdog } = require("./connection-watchdog.js");

const quietLogger = { log() {} };

/** Sock falso: sendPresenceUpdate resolve ou rejeita conforme `mode`. */
function fakeSock(mode = "ok") {
  return {
    calls: 0,
    async sendPresenceUpdate() {
      this.calls++;
      if (mode === "fail") throw new Error("boom");
      if (mode === "hang") return new Promise(() => {}); // nunca resolve
      // "ok"
    },
  };
}

test("onDead dispara UMA vez após 3 falhas consecutivas de ping", async () => {
  let deaths = 0;
  const wd = new ConnectionWatchdog({
    sock: fakeSock("fail"),
    onDead: () => deaths++,
    logger: quietLogger,
  });

  await wd._ping(); // 1/3
  await wd._ping(); // 2/3
  assert.equal(deaths, 0, "não deve declarar morto antes da 3ª falha");
  await wd._ping(); // 3/3 → onDead + stop
  assert.equal(deaths, 1, "onDead deve disparar exatamente na 3ª falha");

  // Após onDead o watchdog se auto-para: novos pings não fazem nada.
  await wd._ping();
  assert.equal(deaths, 1, "não deve disparar onDead de novo após parar");
});

test("um ping bem-sucedido zera o contador de falhas", async () => {
  let deaths = 0;
  const sock = fakeSock("fail");
  const wd = new ConnectionWatchdog({ sock, onDead: () => deaths++, logger: quietLogger });

  await wd._ping(); // 1/3
  await wd._ping(); // 2/3
  // Passa a responder: um sucesso zera o contador.
  sock.sendPresenceUpdate = async () => {};
  await wd._ping(); // sucesso → 0
  assert.equal(wd._consecutiveFails, 0, "sucesso deve zerar as falhas");
  assert.equal(deaths, 0, "não deve declarar morto após o reset");

  // Volta a falhar: precisa de 3 falhas NOVAS (não 1) pra declarar morto.
  sock.sendPresenceUpdate = async () => {
    throw new Error("boom");
  };
  await wd._ping(); // 1/3
  await wd._ping(); // 2/3
  assert.equal(deaths, 0, "2 falhas após reset ainda não bastam");
  await wd._ping(); // 3/3
  assert.equal(deaths, 1, "3 falhas após reset declaram morto");
});

test("timeout do ping conta como falha", async () => {
  const wd = new ConnectionWatchdog({
    sock: fakeSock("hang"), // sendPresenceUpdate nunca resolve
    onDead: () => {},
    timeoutMs: 10, // timeout curtíssimo pro teste não esperar
    logger: quietLogger,
  });

  await wd._ping();
  assert.equal(wd._consecutiveFails, 1, "ping que estoura o timeout é uma falha");
});

test("stop() cancela o timer e marca o watchdog como não-vivo", async () => {
  const wd = new ConnectionWatchdog({ sock: fakeSock("ok"), onDead: () => {}, logger: quietLogger });
  wd.start();
  assert.ok(wd._timer, "start() deve armar o timer");
  wd.stop();
  assert.equal(wd._timer, null, "stop() deve limpar o timer");
  assert.equal(wd._alive, false, "stop() deve marcar não-vivo");

  // Ping após stop não conta falha (guard _alive).
  wd.sock = fakeSock("fail");
  await wd._ping();
  assert.equal(wd._consecutiveFails, 0, "ping após stop() não deve contar falha");
});
