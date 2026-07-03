import assert from "node:assert/strict";
import test from "node:test";
import { isCronAuthorized } from "./cron-auth";

test("cron exige Bearer exato e secret forte", () => {
  const secret = "cron-secret-with-at-least-24-chars";
  assert.equal(isCronAuthorized(`Bearer ${secret}`, secret), true);
  assert.equal(isCronAuthorized("Bearer wrong", secret), false);
  assert.equal(isCronAuthorized(null, secret), false);
  assert.equal(isCronAuthorized("Bearer short", "short"), false);
});
