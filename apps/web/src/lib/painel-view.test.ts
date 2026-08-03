import test from "node:test";
import assert from "node:assert/strict";
import { resolvePainelView, type PainelViewInput } from "./painel-view";

const emptyAccount: PainelViewInput = {
  isConnected: false,
  campaignCount: 0,
  totalMembers: 0,
  totalClicks: 0,
  leadCount: 0,
};

test("sends a brand-new disconnected account to the connect step", () => {
  assert.equal(resolvePainelView(emptyAccount), "onboarding-connect");
});

test("asks for a first campaign once WhatsApp is connected", () => {
  assert.equal(
    resolvePainelView({ ...emptyAccount, isConnected: true }),
    "onboarding-campaign",
  );
});

test("asks the user to share the link when the campaign has no results yet", () => {
  assert.equal(
    resolvePainelView({ ...emptyAccount, isConnected: true, campaignCount: 1 }),
    "onboarding-share",
  );
});

test("shows the dashboard when clicks arrived but groups have not synced members", () => {
  // Este era o beco sem saída: members = 0 prendia no passo 3 para sempre.
  assert.equal(
    resolvePainelView({
      ...emptyAccount,
      isConnected: true,
      campaignCount: 1,
      totalMembers: 0,
      totalClicks: 240,
    }),
    "dashboard",
  );
});

test("shows the dashboard when leads were captured but member counts are missing", () => {
  assert.equal(
    resolvePainelView({
      ...emptyAccount,
      isConnected: true,
      campaignCount: 1,
      totalMembers: 0,
      leadCount: 12,
    }),
    "dashboard",
  );
});

test("keeps an established account on the dashboard while disconnected", () => {
  assert.equal(
    resolvePainelView({
      isConnected: false,
      campaignCount: 3,
      totalMembers: 1800,
      totalClicks: 500,
      leadCount: 90,
    }),
    "dashboard",
  );
});

test("honours the escape hatch from any onboarding step", () => {
  assert.equal(
    resolvePainelView({ ...emptyAccount, skipOnboarding: true }),
    "dashboard",
  );
  assert.equal(
    resolvePainelView({ ...emptyAccount, isConnected: true, campaignCount: 1, skipOnboarding: true }),
    "dashboard",
  );
});
