import assert from "node:assert/strict";
import test from "node:test";
import { classifyRequest, decideEngineAccess } from "./request-access-policy";

test("auth POST is public with rate limiting", () => {
  assert.equal(classifyRequest("/api/auth/login", "POST"), "auth-rate-limited");
});

test("auth callbacks remain public", () => {
  assert.equal(classifyRequest("/api/auth/callback", "GET"), "public");
  assert.equal(classifyRequest("/api/auth/google", "GET"), "public");
});

test("dispatch pending is engine-only", () => {
  assert.equal(classifyRequest("/api/dispatch/pending", "POST"), "engine-only");
});

test("lead reads are shared and ingestion is engine-only", () => {
  assert.equal(classifyRequest("/api/leads", "GET"), "shared");
  assert.equal(classifyRequest("/api/leads", "POST"), "engine-only");
});

test("user mutations on shared resources do not accept engine credentials", () => {
  assert.equal(classifyRequest("/api/leads", "PATCH"), "user");
  assert.equal(classifyRequest("/api/optout", "DELETE"), "user");
  assert.equal(classifyRequest("/api/welcome", "POST"), "user");
  assert.equal(classifyRequest("/api/media", "POST"), "user");
});

test("cron endpoints use handler-level authentication", () => {
  assert.equal(classifyRequest("/api/cron/emails", "GET"), "cron");
  assert.equal(classifyRequest("/api/notifications/alerts", "GET"), "cron");
});

test("the Evolution webhook is session-less and rate limited", () => {
  assert.equal(classifyRequest("/api/webhooks/evolution", "POST"), "webhook");
});

test("the webhook prefix is not open — only the exact provider path is", () => {
  // /api/webhooks/config lê e escreve config de webhook do tenant. Classificar
  // por prefixo a exporia sem sessão.
  assert.equal(classifyRequest("/api/webhooks/config", "GET"), "user");
  assert.equal(classifyRequest("/api/webhooks/config", "POST"), "user");
  // Só POST é webhook: um GET no receiver não deve escapar da sessão.
  assert.equal(classifyRequest("/api/webhooks/evolution", "GET"), "user");
  // Sufixos não herdam a isenção.
  assert.equal(classifyRequest("/api/webhooks/evolution/replay", "POST"), "user");
});

test("an invalid engine token never falls through to user auth", () => {
  assert.equal(decideEngineAccess("shared", "wrong", "expected"), "reject-401");
});

test("an engine-only method rejects requests without engine credentials", () => {
  assert.equal(decideEngineAccess("engine-only", null, "expected"), "reject-403");
});

test("a valid engine token is accepted and shared routes can continue as user", () => {
  assert.equal(decideEngineAccess("engine-only", "expected", "expected"), "allow-engine");
  assert.equal(decideEngineAccess("shared", null, "expected"), "continue-user");
});
