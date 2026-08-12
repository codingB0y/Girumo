import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVATION_STEPS,
  activationLabel,
  resolveActivation,
  type ActivationSignals,
} from "./onboarding-steps";

const emptyAccount: ActivationSignals = {
  isConnected: false,
  groupCount: 0,
  campaignCount: 0,
  totalClicks: 0,
  leadCount: 0,
};

function doneIds(signals: ActivationSignals): string[] {
  return resolveActivation(signals)
    .steps.filter((s) => s.done)
    .map((s) => s.id);
}

test("a brand-new account has nothing done and is pointed at connecting", () => {
  const a = resolveActivation(emptyAccount);
  assert.deepEqual(doneIds(emptyAccount), []);
  assert.equal(a.doneCount, 0);
  assert.equal(a.complete, false);
  assert.equal(a.next?.id, "connect");
});

test("connecting lights only the first step", () => {
  const signals = { ...emptyAccount, isConnected: true };
  assert.deepEqual(doneIds(signals), ["connect"]);
  assert.equal(resolveActivation(signals).next?.id, "groups");
});

test("clicks light the steps they prove even when groups have not synced", () => {
  // Este era o beco sem saída do modelo antigo: members = 0 prendia no passo 3
  // para sempre, mesmo com 240 cliques. Cliques provam campanha e link.
  const signals = { ...emptyAccount, isConnected: true, campaignCount: 1, totalClicks: 240 };
  assert.deepEqual(doneIds(signals), ["connect", "campaign", "share"]);
  assert.equal(resolveActivation(signals).next?.id, "groups");
});

test("a captured lead proves every step below it", () => {
  // Só há contato se alguém clicou num link de campanha e entrou num grupo —
  // mesmo que os contadores de grupo e de clique ainda não reflitam isso.
  const signals = { ...emptyAccount, isConnected: true, leadCount: 12 };
  assert.deepEqual(doneIds(signals), ["connect", "groups", "campaign", "share", "lead"]);
  assert.equal(resolveActivation(signals).complete, true);
  assert.equal(resolveActivation(signals).next, null);
});

test("an established account that disconnected shows only that step as pending", () => {
  const signals: ActivationSignals = {
    isConnected: false,
    groupCount: 8,
    campaignCount: 3,
    totalClicks: 500,
    leadCount: 90,
  };
  assert.equal(resolveActivation(signals).doneCount, 4);
  assert.equal(resolveActivation(signals).next?.id, "connect");
  assert.equal(resolveActivation(signals).complete, false);
});

test("a fully active account is complete with no next step", () => {
  const a = resolveActivation({
    isConnected: true,
    groupCount: 8,
    campaignCount: 3,
    totalClicks: 500,
    leadCount: 90,
  });
  assert.equal(a.doneCount, a.total);
  assert.equal(a.complete, true);
  assert.equal(a.next, null);
});

test("every step carries a destination and a label", () => {
  assert.equal(ACTIVATION_STEPS.length, 5);
  for (const step of ACTIVATION_STEPS) {
    assert.ok(step.label.length > 0, `${step.id} sem rótulo`);
    assert.ok(step.href.startsWith("/painel/"), `${step.id} aponta para fora do painel`);
    assert.ok(step.ctaLabel.length > 0, `${step.id} sem CTA`);
  }
});

test("activationLabel is the single source other surfaces read from", () => {
  assert.equal(activationLabel("connect"), "Conectar WhatsApp");
  assert.equal(activationLabel("campaign"), "Criar primeira campanha");
  assert.throws(() => activationLabel("nope" as never), /desconhecido/);
});
