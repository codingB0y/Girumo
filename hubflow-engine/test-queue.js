import { setTimeout as delay } from "timers/promises";
import { AntiBanQueue } from "./anti-ban-queue.js";

const t0 = Date.now();
const ts = () => `+${String(Date.now() - t0).padStart(5)}ms`;

const q = new AntiBanQueue({
  minDelayMs: 150,
  maxDelayMs: 250,
  priorityDelayMs: 50,
  maxPerMinute: 1000,
  maxPerHour: 1000,
  maxPerDay: 1000,
  maxRetries: 2,
  backoffBaseMs: 120,
  breakerThreshold: 2,
  breakerCooldownMs: 600,
  onLog: (m) => console.log(`${ts()} | ${m}`),
});

const ok = (label) => () => {
  console.log(`${ts()} | ✉️  enviado: ${label}`);
  return Promise.resolve(label);
};

let fails = 0;
const flaky = (label, failTimes) => () => {
  if (fails < failTimes) {
    fails++;
    console.log(`${ts()} | 💥 falha simulada: ${label}`);
    return Promise.reject(new Error("boom"));
  }
  console.log(`${ts()} | ✅ enviado após retry: ${label}`);
  return Promise.resolve(label);
};

console.log("== Teste 1: lane de prioridade fura a fila + espaçamento humanizado ==");
q.enqueue(ok("A (normal)"));
q.enqueue(ok("B (normal)"));
q.enqueue(ok("PRIORITÁRIA"), { priority: true });
q.enqueue(ok("C (normal)"));
await q.enqueue(flaky("D (falha 2x, depois ok)", 2));

console.log("\nStats parciais:", q.stats());

console.log("\n== Teste 2: circuit breaker após falhas consecutivas ==");
// Instância dedicada sem retries para o breaker tripar rápido e visível.
const q2 = new AntiBanQueue({
  minDelayMs: 50,
  maxDelayMs: 80,
  maxRetries: 0,
  breakerThreshold: 2,
  breakerCooldownMs: 500,
  onLog: (m) => console.log(`${ts()} | ${m}`),
});
const alwaysFail = () => Promise.reject(new Error("fail permanente"));
q2.enqueue(alwaysFail).catch(() => console.log(`${ts()} | ❌ rejeitada`));
q2.enqueue(alwaysFail).catch(() => console.log(`${ts()} | ❌ rejeitada`));
// Esta deve esperar o breaker liberar (cooldown) antes de tentar.
q2.enqueue(ok("E (após cooldown do breaker)")).catch(() => {});

await delay(1500);
console.log("\nStats finais (fila 1):", q.stats());
console.log("\n✔️  Teste concluído.");
process.exit(0);
