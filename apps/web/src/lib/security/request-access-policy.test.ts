import assert from "node:assert/strict";
import test from "node:test";
import { classifyRequest } from "./request-access-policy";

test("auth POST is public with rate limiting", () => {
  assert.equal(classifyRequest("/api/auth/login", "POST"), "auth-rate-limited");
});

test("dispatch pending is engine-only", () => {
  assert.equal(classifyRequest("/api/dispatch/pending", "POST"), "engine-only");
});

test("lead reads are shared and ingestion is engine-only", () => {
  assert.equal(classifyRequest("/api/leads", "GET"), "shared");
  assert.equal(classifyRequest("/api/leads", "POST"), "engine-only");
});

test("cron endpoints use handler-level authentication", () => {
  assert.equal(classifyRequest("/api/cron/emails", "GET"), "cron");
  assert.equal(classifyRequest("/api/notifications/alerts", "GET"), "cron");
});
