import test from "node:test";
import assert from "node:assert/strict";
import { POLL_MAX_MS, POLL_MS, nextPollDelay } from "./engine-poll";

test("keeps the normal interval while the engine answers", () => {
  assert.equal(nextPollDelay(POLL_MS, "ok"), POLL_MS);
});

test("returns to the normal interval as soon as a failure recovers", () => {
  assert.equal(nextPollDelay(POLL_MAX_MS, "ok"), POLL_MS);
});

test("doubles the interval on each consecutive failure", () => {
  assert.equal(nextPollDelay(POLL_MS, "error"), 8_000);
  assert.equal(nextPollDelay(8_000, "error"), 16_000);
});

test("caps the backoff so a dead engine is still retried", () => {
  assert.equal(nextPollDelay(20_000, "error"), POLL_MAX_MS);
  assert.equal(nextPollDelay(POLL_MAX_MS, "error"), POLL_MAX_MS);
});

test("never backs off to below the normal interval", () => {
  assert.ok(nextPollDelay(0, "error") >= POLL_MS);
});
