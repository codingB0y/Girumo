import { WarmUp } from "./warmup.js";
import { GroupOperationGuard } from "./group-guard.js";
import { DeliveryTracker } from "./delivery-tracker.js";
import { AntiBanQueue } from "./anti-ban-queue.js";

let pass = 0;
let fail = 0;
const assert = (cond, label) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

console.log("== WarmUp ==");
// growthFactor fixo p/ teste determinístico: dia 0 = 20, dia 1 = 40...
const w = new WarmUp({ day1Limit: 20, growthFactor: 2 });
assert(w.getDailyLimit() === 20, "dia 1: limite 20");
w.state.startedAt = Date.now() - 1 * 86_400_000; // simula dia 2
assert(w.getDailyLimit() === 40, "dia 2: limite 40 (rampa)");
w.state.startedAt = Date.now() - 8 * 86_400_000; // após 7 dias
assert(w.getDailyLimit() === Infinity, "após warm-up: sem limite (graduado)");

console.log("\n== GroupOperationGuard ==");
const g = new GroupOperationGuard();
let allowed = 0;
for (let i = 0; i < 5; i++) {
  if (g.check("add").allowed) {
    g.record("add");
    allowed++;
  }
}
assert(allowed === 3, `só 3 adds permitidos em 10min (foram ${allowed})`);
assert(g.check("add").allowed === false, "4º add bloqueado");
assert(typeof g.check("add").retryAfterSec === "number", "informa retryAfterSec");

console.log("\n== DeliveryTracker ==");
const d = new DeliveryTracker({ minSampleSize: 2 });
for (let i = 0; i < 4; i++) d.onMessageSent(`m${i}`);
d.onDeliveryReceipt("m0");
d.onDeliveryReceipt("m1");
const st = d.getStats();
assert(st.sentInWindow === 4 && st.deliveredInWindow === 2, "2 de 4 entregues");
assert(Math.abs(st.deliveryRate - 0.5) < 1e-9, "taxa de entrega = 50%");

console.log("\n== Fila: warmup gateia o teto diário ==");
const wq = new WarmUp({ day1Limit: 3, growthFactor: 2 }); // teto hoje = 3
let sent = 0;
const q = new AntiBanQueue({
  minDelayMs: 1,
  maxDelayMs: 2,
  getDailyCap: () => wq.getDailyLimit(),
  onSent: () => wq.record(),
  onLog: () => {},
});
for (let i = 0; i < 4; i++) q.enqueue(() => { sent++; return Promise.resolve({ key: { id: `x${i}` } }); });
await new Promise((r) => setTimeout(r, 300));
// 4ª fica travada no _waitForCapacity (já desenfileirada) — o que importa: só 3 enviadas.
assert(sent === 3, `enviou 3 e travou no teto do warmup (sent=${sent})`);

console.log(`\n${fail === 0 ? "✔️  TODOS OK" : "✖️  FALHAS"}: ${pass} passaram, ${fail} falharam.`);
process.exit(fail === 0 ? 0 : 1);
