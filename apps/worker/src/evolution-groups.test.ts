import assert from "node:assert/strict";
import test from "node:test";

import { createEvolutionGroups, EvolutionGroupError, parseCreatedGroupJid } from "./evolution-groups.js";

type Captured = { url: string; init: RequestInit };

function makeGroups(respond: (captured: Captured) => Response): {
  groups: ReturnType<typeof createEvolutionGroups>;
  calls: Captured[];
} {
  const calls: Captured[] = [];
  const groups = createEvolutionGroups({
    baseUrl: "https://evo.example",
    apiKey: "apikey-secreta",
    fetchImpl: async (url, init) => {
      const captured = { url, init };
      calls.push(captured);
      return respond(captured);
    },
  });
  return { groups, calls };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

test("cria o grupo SEM participantes — popular por add dispararia reachout_restricted", async () => {
  const { groups, calls } = makeGroups(() => json({ id: "120363000000000001@g.us" }));

  const jid = await groups.createGroup("girumo-1", "Bazar #2");

  assert.equal(jid, "120363000000000001@g.us");
  const body = JSON.parse(String(calls[0]?.init.body));
  assert.deepEqual(body, { subject: "Bazar #2", participants: [] });
});

test("manda a apikey no header em toda operação", async () => {
  const { groups, calls } = makeGroups(() => json({ id: "120363000000000001@g.us" }));

  await groups.createGroup("girumo-1", "Bazar #2");

  assert.equal((calls[0]?.init.headers as Record<string, string>).apikey, "apikey-secreta");
});

test("nome de instância com caractere especial vai escapado na URL", async () => {
  const { groups, calls } = makeGroups(() => json({ id: "120363000000000001@g.us" }));

  await groups.createGroup("loja da maria", "Bazar #2");

  assert.equal(calls[0]?.url, "https://evo.example/group/create/loja%20da%20maria");
});

test("resposta de create sem JID utilizável lança em vez de virar grupo fantasma", async () => {
  // Gravar `undefined` como JID criaria uma linha no pool com invite_url de um
  // grupo real e um id que não existe — pior do que falhar o job.
  const { groups } = makeGroups(() => json({ status: "ok" }));

  await assert.rejects(
    () => groups.createGroup("girumo-1", "Bazar #2"),
    (err: unknown) => err instanceof EvolutionGroupError && /sem JID/.test(err.message),
  );
});

test("parseCreatedGroupJid só aceita algo que pareça um JID de grupo", () => {
  assert.equal(parseCreatedGroupJid({ id: "120363000000000001@g.us" }), "120363000000000001@g.us");
  assert.equal(parseCreatedGroupJid({ groupJid: "120363000000000002@g.us" }), "120363000000000002@g.us");
  // @s.whatsapp.net é JID de PESSOA: aceitá-lo mandaria mensagem de grupo para
  // um número — exatamente o caminho de DM que o anti-ban proíbe.
  assert.equal(parseCreatedGroupJid({ id: "5562999999999@s.whatsapp.net" }), null);
  assert.equal(parseCreatedGroupJid({ id: "" }), null);
  assert.equal(parseCreatedGroupJid({ id: 42 }), null);
  assert.equal(parseCreatedGroupJid(null), null);
  assert.equal(parseCreatedGroupJid("120363000000000001@g.us"), null);
});

test("as operações de configuração levam o groupJid na query", async () => {
  const { groups, calls } = makeGroups(() => json({}));

  await groups.setDescription("girumo-1", "120363000000000001@g.us", "Bazar diário");
  await groups.setAnnounceOnly("girumo-1", "120363000000000001@g.us");
  await groups.setPicture("girumo-1", "120363000000000001@g.us", "https://signed.example/f.jpg");

  for (const call of calls) {
    assert.match(call.url, /groupJid=120363000000000001%40g\.us/);
  }
});

test('só-admin manda action "announcement"', async () => {
  const { groups, calls } = makeGroups(() => json({}));

  await groups.setAnnounceOnly("girumo-1", "120363000000000001@g.us");

  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { action: "announcement" });
});

test("convite passa pela normalização — não entra host alheio no pool", async () => {
  const { groups } = makeGroups(() => json({ inviteUrl: "https://evil.example/ABC123" }));

  assert.equal(await groups.inviteUrl("girumo-1", "120363000000000001@g.us"), null);
});

test("convite válido volta canônico", async () => {
  const { groups } = makeGroups(() => json({ inviteCode: "ABC123xyz" }));

  assert.equal(
    await groups.inviteUrl("girumo-1", "120363000000000001@g.us"),
    "https://chat.whatsapp.com/ABC123xyz",
  );
});

test("erro HTTP preserva o status — 429 e 403 pedem reações diferentes", async () => {
  const { groups } = makeGroups(() => new Response("rate-overlimit", { status: 429 }));

  await assert.rejects(
    () => groups.createGroup("girumo-1", "Bazar #2"),
    (err: unknown) => err instanceof EvolutionGroupError && err.status === 429,
  );
});

test("falha de rede vira status 0, não se confunde com erro HTTP", async () => {
  const groups = createEvolutionGroups({
    baseUrl: "https://evo.example",
    apiKey: "k",
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    },
  });

  await assert.rejects(
    () => groups.createGroup("girumo-1", "Bazar #2"),
    (err: unknown) => err instanceof EvolutionGroupError && err.status === 0,
  );
});

test("a apikey nunca aparece na mensagem de erro", async () => {
  // É credencial de administração da stack: quem a tem cria e apaga instância.
  const { groups } = makeGroups(() => new Response("boom", { status: 500 }));

  const err = await groups.createGroup("girumo-1", "x").catch((e: unknown) => e);

  assert.ok(err instanceof Error);
  assert.doesNotMatch(err.message, /apikey-secreta/);
});
