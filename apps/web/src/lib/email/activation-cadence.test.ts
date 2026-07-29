import assert from "node:assert/strict";
import { activationMarkerForAge, activationNotificationType, ACTIVATION_MARKERS } from "./activation-cadence";

// Antes de D3 → nada.
assert.equal(activationMarkerForAge(0), null);
assert.equal(activationMarkerForAge(2), null);

// Cada janela mapeia pro seu marco (inclusive nas bordas).
assert.equal(activationMarkerForAge(3), 3);
assert.equal(activationMarkerForAge(6), 3);
assert.equal(activationMarkerForAge(7), 7);
assert.equal(activationMarkerForAge(13), 7);
assert.equal(activationMarkerForAge(14), 14);
assert.equal(activationMarkerForAge(20), 14);
assert.equal(activationMarkerForAge(21), 21);
assert.equal(activationMarkerForAge(27), 21);

// A partir de 28 dias a cadência encerra.
assert.equal(activationMarkerForAge(28), null);
assert.equal(activationMarkerForAge(60), null);

// Tipos de notificação pro dedupe.
assert.equal(activationNotificationType(3), "activation_d3");
assert.equal(activationNotificationType(21), "activation_d21");

// Sanidade dos marcos declarados.
assert.deepEqual([...ACTIVATION_MARKERS], [3, 7, 14, 21]);

console.log("activation-cadence tests passed");
