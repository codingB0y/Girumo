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

test("growEnabled e false por default — criar grupo e irreversivel", () => {
  withEnv({ WORKER_GROW_ENABLED: undefined }, () => {
    assert.equal(loadEnv().growEnabled, false);
  });
});

test('so "true" liga a criacao real de grupo', () => {
  withEnv({ WORKER_GROW_ENABLED: "true" }, () => {
    assert.equal(loadEnv().growEnabled, true);
  });
  withEnv({ WORKER_GROW_ENABLED: "1" }, () => {
    assert.equal(loadEnv().growEnabled, false);
  });
});

test("growIntervalMs default e 5min — e o que faz o teto de ~2 criacoes/10min", () => {
  withEnv({ WORKER_GROW_INTERVAL_MS: undefined }, () => {
    assert.equal(loadEnv().growIntervalMs, 300_000);
  });
});

test("growIntervalMs abaixo de 60s e recusado: afrouxaria o anti-ban em silencio", () => {
  withEnv({ WORKER_GROW_INTERVAL_MS: "5000" }, () => {
    assert.throws(() => loadEnv(), /WORKER_GROW_INTERVAL_MS/);
  });
});

test("APP_URL e ENGINE_TOKEN sao opcionais: sem eles o auto-grow so fica desligado", () => {
  withEnv({ APP_URL: undefined, ENGINE_TOKEN: undefined }, () => {
    const env = loadEnv();
    assert.equal(env.appBaseUrl, null);
    assert.equal(env.engineToken, null);
  });
});

test("recountEnabled e false por default — a recontagem nasce em dry-run como os outros loops", () => {
  withEnv({ WORKER_RECOUNT_ENABLED: undefined }, () => {
    assert.equal(loadEnv().recountEnabled, false);
  });
  withEnv({ WORKER_RECOUNT_ENABLED: "true" }, () => {
    assert.equal(loadEnv().recountEnabled, true);
  });
  withEnv({ WORKER_RECOUNT_ENABLED: "1" }, () => {
    assert.equal(loadEnv().recountEnabled, false);
  });
});

test("recountIntervalMs default e 24h", () => {
  withEnv({ WORKER_RECOUNT_INTERVAL_MS: undefined }, () => {
    assert.equal(loadEnv().recountIntervalMs, 86_400_000);
  });
});

test("recountIntervalMs abaixo de 1h e recusado: cada volta e um fetchAllGroups por loja", () => {
  withEnv({ WORKER_RECOUNT_INTERVAL_MS: "600000" }, () => {
    assert.throws(() => loadEnv(), /WORKER_RECOUNT_INTERVAL_MS/);
  });
  withEnv({ WORKER_RECOUNT_INTERVAL_MS: "3600000" }, () => {
    assert.equal(loadEnv().recountIntervalMs, 3_600_000);
  });
});
