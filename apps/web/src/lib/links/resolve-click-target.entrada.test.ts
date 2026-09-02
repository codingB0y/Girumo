import assert from "node:assert/strict";
import { ENTRADA_DEFAULTS } from "../campaigns/settings";
import { resolveClickTarget, type ResolvableGroup } from "./resolve-click-target";

/**
 * O que as configurações de ENTRADA mudam na rotação do link mestre:
 * grupo lembrado pelo cookie e encerramento por data. O resto da rotação
 * (cheio, sem convite, sem admin) continua coberto em resolve-click-target.test.ts.
 */

const group = (over: Partial<ResolvableGroup> & { whatsapp_group_id: string }): ResolvableGroup => ({
  members: 0,
  capacity: 1000,
  invite_url: "https://chat.whatsapp.com/AAA",
  ...over,
});

const masterLink = { campaign_group_id: "camp-1", target_url: "", clicks: 0, metadata: {} };
const pool = [
  group({ whatsapp_group_id: "g1@g.us", name: "Saldão 1", members: 990, capacity: 1000 }), // cheio
  group({ whatsapp_group_id: "g2@g.us", name: "Saldão 2", invite_url: "https://chat.whatsapp.com/BBB" }),
];
const campaign = { group_ids: ["g1@g.us", "g2@g.us"] };

// Sem cookie: rotação normal pula o cheio e entrega o nome do grupo.
const normal = resolveClickTarget({ link: masterLink, campaign, groups: pool, entrada: ENTRADA_DEFAULTS });
assert.equal(normal.kind, "redirect");
if (normal.kind === "redirect") {
  assert.equal(normal.groupId, "g2@g.us");
  assert.equal(normal.groupName, "Saldão 2");
}

// Grupo lembrado vence MESMO cheio (D3): quem clicou uma vez já está lá.
const lembrado = resolveClickTarget({
  link: masterLink,
  campaign,
  groups: pool,
  entrada: ENTRADA_DEFAULTS,
  rememberedGroupId: "g1@g.us",
});
assert.equal(lembrado.kind, "redirect");
if (lembrado.kind === "redirect") assert.equal(lembrado.groupId, "g1@g.us");

// Com a opção desligada o cookie é ignorado.
const ignorado = resolveClickTarget({
  link: masterLink,
  campaign,
  groups: pool,
  entrada: { ...ENTRADA_DEFAULTS, um_grupo_por_pessoa: false },
  rememberedGroupId: "g1@g.us",
});
assert.equal(ignorado.kind, "redirect");
if (ignorado.kind === "redirect") assert.equal(ignorado.groupId, "g2@g.us");

// Grupo lembrado que saiu da campanha (ou perdeu o convite) cai na rotação.
const fora = resolveClickTarget({ link: masterLink, campaign, groups: pool, entrada: ENTRADA_DEFAULTS, rememberedGroupId: "g9@g.us" });
assert.equal(fora.kind, "redirect");
if (fora.kind === "redirect") assert.equal(fora.groupId, "g2@g.us");
const semConvite = resolveClickTarget({
  link: masterLink,
  campaign,
  groups: [group({ whatsapp_group_id: "g1@g.us", invite_url: null }), pool[1]],
  entrada: ENTRADA_DEFAULTS,
  rememberedGroupId: "g1@g.us",
});
assert.equal(semConvite.kind, "redirect");
if (semConvite.kind === "redirect") assert.equal(semConvite.groupId, "g2@g.us");

// Encerrada por data: bloqueia com "closed" antes de olhar o pool.
const fechada = resolveClickTarget({
  link: masterLink,
  campaign,
  groups: pool,
  entrada: { ...ENTRADA_DEFAULTS, encerra_em: "2026-09-30" },
  now: new Date("2026-10-02T12:00:00Z"),
});
assert.deepEqual(fechada, { kind: "blocked", reason: "closed" });
// …e no dia, ainda aberta.
const noDia = resolveClickTarget({
  link: masterLink,
  campaign,
  groups: pool,
  entrada: { ...ENTRADA_DEFAULTS, encerra_em: "2026-09-30" },
  now: new Date("2026-09-30T20:00:00Z"),
});
assert.equal(noDia.kind, "redirect");

// Link comum (sem campanha) nunca usa cookie nem data.
const comum = resolveClickTarget({
  link: { campaign_group_id: null, target_url: "https://x.com", clicks: 0, metadata: {} },
  campaign: null,
  groups: [],
  rememberedGroupId: "g1@g.us",
});
assert.deepEqual(comum, { kind: "redirect", url: "https://x.com", pixelId: undefined });

console.log("resolve-click-target.entrada.test ok");
