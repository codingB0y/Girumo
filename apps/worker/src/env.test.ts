import assert from "node:assert/strict";
import test from "node:test";

import { loadEnv } from "./env.js";

/** Env mínimo para `loadEnv` não abortar nos obrigatórios. */
function withEnv(extra: Record<string, string | undefined>, fn: () => void): void {
  const saved = { ...process.env };
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    process.env = saved;
  }
}

test("sendEnabled e false por default — dry-run e a postura padrao", () => {
  withEnv({ WORKER_SEND_ENABLED: undefined }, () => {
    assert.equal(loadEnv().sendEnabled, false);
  });
});

test('so "true" liga o envio real', () => {
  withEnv({ WORKER_SEND_ENABLED: "true" }, () => {
    assert.equal(loadEnv().sendEnabled, true);
  });
  withEnv({ WORKER_SEND_ENABLED: "TRUE" }, () => {
    assert.equal(loadEnv().sendEnabled, true, "case-insensitive");
  });
  withEnv({ WORKER_SEND_ENABLED: " true " }, () => {
    assert.equal(loadEnv().sendEnabled, true, "espaco em volta nao deveria atrapalhar");
  });
});

test("valor ambiguo ou vazio cai em dry-run, nunca em envio", () => {
  for (const raw of ["", "1", "yes", "sim", "false", "on", "verdadeiro"]) {
    withEnv({ WORKER_SEND_ENABLED: raw }, () => {
      assert.equal(loadEnv().sendEnabled, false, `"${raw}" nao pode ligar o envio`);
    });
  }
});
