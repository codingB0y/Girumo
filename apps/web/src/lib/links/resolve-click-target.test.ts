import assert from "node:assert/strict";
import {
  isGroupAvailable,
  nextAvailableGroup,
  readClickCap,
  readPixelId,
  resolveClickTarget,
  type ResolvableGroup,
} from "./resolve-click-target";

const group = (over: Partial<ResolvableGroup> & { whatsapp_group_id: string }): ResolvableGroup => ({
  members: 0,
  capacity: 1000,
  invite_url: "https://chat.whatsapp.com/AAA",
  ...over,
});

// --- disponibilidade -------------------------------------------------------

// Vazio com convite → disponível.
assert.equal(isGroupAvailable(group({ whatsapp_group_id: "a@g.us" })), true);
// 95% da capacidade → cheio (deixa folga p/ não estourar).
assert.equal(isGroupAvailable(group({ whatsapp_group_id: "a@g.us", members: 950 })), false);
assert.equal(isGroupAvailable(group({ whatsapp_group_id: "a@g.us", members: 949 })), true);
// Sem convite nunca é destino, por mais vazio que esteja.
assert.equal(isGroupAvailable(group({ whatsapp_group_id: "a@g.us", invite_url: null })), false);
// Capacidade zerada cai no padrão do WhatsApp em vez de tratar todo mundo como cheio.
assert.equal(isGroupAvailable(group({ whatsapp_group_id: "a@g.us", capacity: 0, members: 10 })), true);
// Convite que não é URL absoluta nunca é eleito (Response.redirect estouraria).
assert.equal(isGroupAvailable(group({ whatsapp_group_id: "a@g.us", invite_url: "chat.whatsapp.com/AAA" })), false);
assert.equal(isGroupAvailable(group({ whatsapp_group_id: "a@g.us", invite_url: "" })), false);

// --- rotação sequencial ("lota sozinho") -----------------------------------

const pool = ["a@g.us", "b@g.us", "c@g.us"];
const groups = [
  group({ whatsapp_group_id: "a@g.us", members: 1000 }), // cheio
  group({ whatsapp_group_id: "b@g.us", invite_url: null }), // sem convite
  group({ whatsapp_group_id: "c@g.us", members: 10 }), // disponível
];
// Pula cheio e sem-convite, transborda pro próximo com vaga.
assert.equal(nextAvailableGroup(pool, groups)?.whatsapp_group_id, "c@g.us");
// Respeita a ORDEM do pool, não a ordem da lista de grupos.
assert.equal(nextAvailableGroup(["c@g.us", "a@g.us"], groups)?.whatsapp_group_id, "c@g.us");
// Grupo do pool que não existe mais é ignorado, não quebra.
assert.equal(nextAvailableGroup(["sumiu@g.us", "c@g.us"], groups)?.whatsapp_group_id, "c@g.us");
// Nenhum disponível → null.
assert.equal(nextAvailableGroup(["a@g.us", "b@g.us"], groups), null);

// --- metadata --------------------------------------------------------------

assert.equal(readClickCap({ clickCap: 50 }), 50);
assert.equal(readClickCap({ clickCap: "50" }), 50);
assert.equal(readClickCap({ clickCap: 0 }), null);
assert.equal(readClickCap({}), null);
assert.equal(readPixelId({ pixelId: "1234567890" }), "1234567890");
// Id implausível não vira script de pixel na página.
assert.equal(readPixelId({ pixelId: "abc" }), undefined);
assert.equal(readPixelId({ pixelId: "12" }), undefined);

// --- link MESTRE de campanha (destino rotativo) ----------------------------

const master = { campaign_group_id: "cg1", target_url: "", clicks: 0, metadata: {} };

// Com vaga → redireciona pro convite do grupo escolhido.
assert.deepEqual(
  resolveClickTarget({
    link: master,
    campaign: { group_ids: ["a@g.us", "c@g.us"] },
    groups,
  }),
  { kind: "redirect", url: "https://chat.whatsapp.com/AAA", groupId: "c@g.us", pixelId: undefined },
);

// Todos com convite porém cheios → "cheio" de verdade.
assert.deepEqual(
  resolveClickTarget({
    link: master,
    campaign: { group_ids: ["a@g.us"] },
    groups,
  }),
  { kind: "blocked", reason: "all-full" },
);

// Grupos existem mas nenhum tem convite → NÃO é "cheio", é falta de configuração.
assert.deepEqual(
  resolveClickTarget({
    link: master,
    campaign: { group_ids: ["b@g.us"] },
    groups,
  }),
  { kind: "blocked", reason: "no-invite" },
);

// Campanha sem grupos no pool.
assert.deepEqual(
  resolveClickTarget({ link: master, campaign: { group_ids: [] }, groups }),
  { kind: "blocked", reason: "empty-pool" },
);

// Link mestre órfão (campanha sumiu) nunca redireciona pra lugar nenhum.
assert.deepEqual(
  resolveClickTarget({ link: master, campaign: null, groups }),
  { kind: "blocked", reason: "empty-pool" },
);

// --- link comum (destino fixo) ---------------------------------------------

const fixo = {
  campaign_group_id: null,
  target_url: "https://chat.whatsapp.com/FIXO",
  clicks: 0,
  metadata: {} as Record<string, unknown>,
};

assert.deepEqual(
  resolveClickTarget({ link: fixo, campaign: null, groups: [] }),
  { kind: "redirect", url: "https://chat.whatsapp.com/FIXO", pixelId: undefined },
);

// Teto de cliques atingido → para de redirecionar ("grupo cheio").
assert.deepEqual(
  resolveClickTarget({
    link: { ...fixo, clicks: 50, metadata: { clickCap: 50 } },
    campaign: null,
    groups: [],
  }),
  { kind: "blocked", reason: "cap-reached" },
);
// Um clique antes do teto ainda passa.
assert.deepEqual(
  resolveClickTarget({
    link: { ...fixo, clicks: 49, metadata: { clickCap: 50 } },
    campaign: null,
    groups: [],
  }),
  { kind: "redirect", url: "https://chat.whatsapp.com/FIXO", pixelId: undefined },
);
// Pixel válido viaja junto pro intersticial.
assert.deepEqual(
  resolveClickTarget({
    link: { ...fixo, metadata: { pixelId: "1234567890" } },
    campaign: null,
    groups: [],
  }),
  { kind: "redirect", url: "https://chat.whatsapp.com/FIXO", pixelId: "1234567890" },
);

console.log("resolve-click-target tests passed");
