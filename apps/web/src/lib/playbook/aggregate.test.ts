import assert from "node:assert/strict";
import { computePlaybook, type PlaybookSignals } from "./aggregate";

const base: PlaybookSignals = {
  isConnected: false,
  campaignCount: 0,
  broadcastCount: 0,
  hasWelcomeAutomation: false,
  leadCount: 0,
  orderCount: 0,
  hasGoal: false,
  persistedDoneAt: {},
};

// Conta nova, nada feito → 0/8, próximo = connect.
{
  const s = computePlaybook(base);
  assert.equal(s.completed, 0);
  assert.equal(s.total, 8);
  assert.equal(s.nextStepKey, "connect");
  assert.equal(s.graduated, false);
}

// Conectou + 1 campanha → connect e first_campaign done, próximo = share_link (manual).
{
  const s = computePlaybook({ ...base, isConnected: true, campaignCount: 2 });
  assert.equal(s.steps.find((x) => x.key === "connect")?.done, true);
  assert.equal(s.steps.find((x) => x.key === "first_campaign")?.done, true);
  assert.equal(s.nextStepKey, "share_link");
  assert.equal(s.completed, 2);
}

// Passo manual persistido, sem sinal ao vivo → done.
{
  const s = computePlaybook({ ...base, persistedDoneAt: { share_link: "2026-07-20T00:00:00Z" } });
  const share = s.steps.find((x) => x.key === "share_link");
  assert.equal(share?.done, true);
  assert.equal(share?.doneAt, "2026-07-20T00:00:00Z");
}

// Guarda de regressão: desconectado agora, mas connect já persistido → segue done.
{
  const s = computePlaybook({ ...base, isConnected: false, persistedDoneAt: { connect: "2026-07-01T00:00:00Z" } });
  assert.equal(s.steps.find((x) => x.key === "connect")?.done, true);
}

// Limiar leads_50: 49 não; 50 sim.
{
  assert.equal(computePlaybook({ ...base, leadCount: 49 }).steps.find((x) => x.key === "leads_50")?.done, false);
  assert.equal(computePlaybook({ ...base, leadCount: 50 }).steps.find((x) => x.key === "leads_50")?.done, true);
}

// Limiar first_order: 0 não; 1 sim.
{
  assert.equal(computePlaybook({ ...base, orderCount: 0 }).steps.find((x) => x.key === "first_order")?.done, false);
  assert.equal(computePlaybook({ ...base, orderCount: 1 }).steps.find((x) => x.key === "first_order")?.done, true);
}

// Tudo satisfeito → 8/8, graduated, sem próximo.
{
  const s = computePlaybook({
    isConnected: true,
    campaignCount: 1,
    broadcastCount: 1,
    hasWelcomeAutomation: true,
    leadCount: 50,
    orderCount: 1,
    hasGoal: true,
    persistedDoneAt: { share_link: "2026-07-20T00:00:00Z" },
  });
  assert.equal(s.completed, 8);
  assert.equal(s.graduated, true);
  assert.equal(s.nextStepKey, null);
}

// Ordem do próximo com buraco: meta definida mas connect faltando → próximo = connect.
{
  const s = computePlaybook({ ...base, hasGoal: true });
  assert.equal(s.steps.find((x) => x.key === "monthly_goal")?.done, true);
  assert.equal(s.nextStepKey, "connect");
}

console.log("playbook aggregate tests passed");
