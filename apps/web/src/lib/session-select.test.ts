import assert from "node:assert/strict";
import { isConnectedStatus, selectSessionRow, type SelectableRow } from "./session-select";

type Row = SelectableRow & { id: string };

const row = (id: string, status: string | null, updated_at: string | null): Row => ({
  id,
  status,
  updated_at,
});

// isConnectedStatus
assert.equal(isConnectedStatus("connected"), true);
assert.equal(isConnectedStatus("online"), true);
assert.equal(isConnectedStatus("qr"), false);
assert.equal(isConnectedStatus("connecting"), false);
assert.equal(isConnectedStatus("disconnected"), false);
assert.equal(isConnectedStatus(null), false);
assert.equal(isConnectedStatus(undefined), false);

// vazio → null
assert.equal(selectSessionRow([]), null);

// única conectada → ela mesma
assert.equal(selectSessionRow([row("a", "connected", "2026-07-28T03:00:00Z")])?.id, "a");

// BUG: linha qr mais recente NÃO pode mascarar a connected mais antiga
assert.equal(
  selectSessionRow([
    row("qr", "qr", "2026-07-28T11:00:00Z"),
    row("conn", "connected", "2026-07-28T03:00:00Z"),
  ])?.id,
  "conn",
);

// "online" também conta como conectada
assert.equal(
  selectSessionRow([
    row("connecting", "connecting", "2026-07-28T12:00:00Z"),
    row("online", "online", "2026-07-28T09:00:00Z"),
  ])?.id,
  "online",
);

// nenhuma conectada → mais recente no geral (ordem de entrada não importa)
assert.equal(
  selectSessionRow([
    row("old", "disconnected", "2026-07-27T10:00:00Z"),
    row("new", "qr", "2026-07-28T10:00:00Z"),
  ])?.id,
  "new",
);

// duas conectadas → a conectada mais recente
assert.equal(
  selectSessionRow([
    row("conn-old", "connected", "2026-07-28T01:00:00Z"),
    row("conn-new", "connected", "2026-07-28T08:00:00Z"),
  ])?.id,
  "conn-new",
);

// updated_at nulo não quebra a ordenação
assert.equal(
  selectSessionRow([
    row("nil", "connected", null),
    row("dated", "qr", "2026-07-28T08:00:00Z"),
  ])?.id,
  "nil",
);

console.log("session-select tests passed");
