import assert from "node:assert/strict";
import { isLive, STALE_CONNECTED_THRESHOLD_MS } from "./session-liveness";

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();

// status disconnected nunca é live, não importa o quão recente.
assert.equal(isLive({ status: "disconnected", updatedAt: minutesAgo(0) }), false);

// connected recente → live.
assert.equal(isLive({ status: "connected", updatedAt: minutesAgo(1) }), true);

// BUG que motivou o fix: conexão connected estável sem transição de estado
// há mais de 90s (ex.: 5h, como observado em produção) continua live — só
// connection.update toca updated_at, não é heartbeat periódico.
assert.equal(isLive({ status: "connected", updatedAt: minutesAgo(5 * 60) }), true);

// ainda dentro do teto de 24h (23h59) → live.
assert.equal(
  isLive({ status: "connected", updatedAt: new Date(now - STALE_CONNECTED_THRESHOLD_MS + 60_000).toISOString() }),
  true,
);

// além do teto de 24h → considerada abandonada, não live.
assert.equal(
  isLive({ status: "connected", updatedAt: new Date(now - STALE_CONNECTED_THRESHOLD_MS - 60_000).toISOString() }),
  false,
);

console.log("session-liveness tests passed");
