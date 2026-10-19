import assert from "node:assert/strict";
import { isLive } from "./session-liveness";

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

// status disconnected nunca é live, não importa o quão recente.
assert.equal(isLive({ status: "disconnected", updatedAt: hoursAgo(0) }), false);

// connected recente → live.
assert.equal(isLive({ status: "connected", updatedAt: hoursAgo(0) }), true);

// BUG de 18/10 (e de 09/09): número connected e estável, sem transição há
// mais de 24h (1d e 3d medidos em prod), aparecia como desconectado no painel.
assert.equal(isLive({ status: "connected", updatedAt: hoursAgo(25) }), true);
assert.equal(isLive({ status: "connected", updatedAt: hoursAgo(3 * 24) }), true);

console.log("session-liveness tests passed");
