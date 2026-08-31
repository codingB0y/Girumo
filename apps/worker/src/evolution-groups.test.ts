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

test("cria o grupo só com o próprio dono em participants", async () => {
  // O schema da v2.3.7 exige `participants` com minItems 1, então `[]` (o que o
  // Baileys aceitava) seria 400 em todo grow. Passar o número da própria
  // instância não fura o anti-ban: o criador já é membro, não há add de terceiro.
  const { groups, calls } = makeGroups(() => json({ id: "120363000000000001@g.us" }));

  const jid = await groups.createGroup("girumo-1", "Bazar #2", "556298191314");

  assert.equal(jid, "120363000000000001@g.us");
  const body = JSON.parse(String(calls[0]?.init.body));
  assert.deepEqual(body, { subject: "Bazar #2", participants: ["556298191314"] });
});

test("nunca manda participants vazio — seria 400 no schema da Evolution", async () => {
  const { groups, calls } = makeGroups(() => json({ id: "120363000000000001@g.us" }));

  await groups.createGroup("girumo-1", "Bazar #2", "+55 (62) 99819-1314");

  const body = JSON.parse(String(calls[0]?.init.body));
  assert.equal(body.participants.length, 1);
  // Só dígitos: o schema exige pattern \d+ e minLength 10.
  assert.equal(body.participants[0], "5562998191314");
});

test("número ausente ou curto falha ANTES de chamar a Evolution", async () => {
  // Instância em `pending` tem phone nulo. Sem esta guarda o erro voltaria da
  // Evolution como um 400 genérico, ou pior: o número seria filtrado por
  // `whatsappNumber` e o create receberia lista vazia.
  const { groups, calls } = makeGroups(() => json({ id: "120363000000000001@g.us" }));

  for (const ruim of ["", "   ", "123", "abc"]) {
    await assert.rejects(
      () => groups.createGroup("girumo-1", "Bazar #2", ruim),
      (err: unknown) => err instanceof EvolutionGroupError && /número da instância/.test(err.message),
    );
  }
  assert.deepEqual(calls, [], "nada deveria ter ido para a rede");
});

test("manda a apikey no header em toda operação", async () => {
  const { groups, calls } = makeGroups(() => json({ id: "120363000000000001@g.us" }));

  await groups.createGroup("girumo-1", "Bazar #2", "556298191314");

  assert.equal((calls[0]?.init.headers as Record<string, string>).apikey, "apikey-secreta");
});

test("nome de instância com caractere especial vai escapado na URL", async () => {
  const { groups, calls } = makeGroups(() => json({ id: "120363000000000001@g.us" }));

  await groups.createGroup("loja da maria", "Bazar #2", "556298191314");

  assert.equal(calls[0]?.url, "https://evo.example/group/create/loja%20da%20maria");
});

test("resposta de create sem JID utilizável lança em vez de virar grupo fantasma", async () => {
  // Gravar `undefined` como JID criaria uma linha no pool com invite_url de um
  // grupo real e um id que não existe — pior do que falhar o job.
  const { groups } = makeGroups(() => json({ status: "ok" }));

  await assert.rejects(
    () => groups.createGroup("girumo-1", "Bazar #2", "556298191314"),
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

test('reabrir manda action "not_announcement" — o inverso exato do fechar', async () => {
  const { groups, calls } = makeGroups(() => json({}));

  await groups.setOpenToAll("girumo-1", "120363000000000001@g.us");

  assert.match(
    calls[0]?.url ?? "",
    /\/group\/updateSetting\/girumo-1\?groupJid=120363000000000001%40g\.us$/,
  );
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { action: "not_announcement" });
});

test("fechar e reabrir usam a MESMA rota e diferem só na action", async () => {
  // Fixa o par. Se alguém trocar uma das duas por outra rota (ou inverter as
  // actions), o grupo passaria a abrir quando deveria fechar — e o lojista só
  // descobriria pelo estrago no grupo, não por erro.
  const { groups, calls } = makeGroups(() => json({}));

  await groups.setAnnounceOnly("girumo-1", "120363000000000001@g.us");
  await groups.setOpenToAll("girumo-1", "120363000000000001@g.us");

  assert.equal(calls[0]?.url, calls[1]?.url);
  assert.deepEqual(
    calls.map((c) => JSON.parse(String(c.init.body)).action),
    ["announcement", "not_announcement"],
  );
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
    () => groups.createGroup("girumo-1", "Bazar #2", "556298191314"),
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
    () => groups.createGroup("girumo-1", "Bazar #2", "556298191314"),
    (err: unknown) => err instanceof EvolutionGroupError && err.status === 0,
  );
});

test("a apikey nunca aparece na mensagem de erro", async () => {
  // É credencial de administração da stack: quem a tem cria e apaga instância.
  const { groups } = makeGroups(() => new Response("boom", { status: 500 }));

  const err = await groups.createGroup("girumo-1", "x", "556298191314").catch((e: unknown) => e);

  assert.ok(err instanceof Error);
  assert.doesNotMatch(err.message, /apikey-secreta/);
});
