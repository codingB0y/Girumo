import test from "node:test";
import assert from "node:assert/strict";
import { buildActivityFeed, timeAgo } from "./activity-feed";

const NOW = new Date("2026-08-11T18:00:00.000Z");

test("junta as três fontes numa linha do tempo, da mais recente pra mais antiga", () => {
  const feed = buildActivityFeed(
    {
      leads: [{ id: "l1", name: "Ana", sourceGroup: "VIP 3", enteredAt: "2026-08-11T17:00:00.000Z" }],
      orders: [{ id: "o1", value: 250, created_at: "2026-08-11T17:30:00.000Z" }],
      schedules: [
        { id: "s1", campaignName: "Grade Nova", scheduledAt: "2026-08-11T16:00:00.000Z", status: "sent" },
      ],
    },
    10,
  );

  assert.deepEqual(
    feed.map((i) => i.kind),
    ["order", "lead", "broadcast"],
  );
  assert.equal(feed[0].at, "2026-08-11T17:30:00.000Z");
});

test("cada tipo carrega o que a linha precisa mostrar", () => {
  const feed = buildActivityFeed(
    {
      leads: [{ id: "l1", name: "Ana", sourceGroup: "VIP 3", enteredAt: "2026-08-11T17:00:00.000Z" }],
      orders: [{ id: "o1", value: 250, created_at: "2026-08-11T16:00:00.000Z" }],
      schedules: [
        { id: "s1", campaignName: "Grade Nova", scheduledAt: "2026-08-11T15:00:00.000Z", status: "sent" },
      ],
    },
    10,
  );

  assert.deepEqual(feed[0], {
    id: "lead-l1",
    kind: "lead",
    at: "2026-08-11T17:00:00.000Z",
    name: "Ana",
    group: "VIP 3",
  });
  assert.deepEqual(feed[1], { id: "order-o1", kind: "order", at: "2026-08-11T16:00:00.000Z", value: 250 });
  assert.deepEqual(feed[2], {
    id: "broadcast-s1",
    kind: "broadcast",
    at: "2026-08-11T15:00:00.000Z",
    campaignName: "Grade Nova",
  });
});

test("só disparo já enviado entra — agendado ainda não aconteceu", () => {
  const feed = buildActivityFeed(
    {
      leads: [],
      orders: [],
      schedules: [
        { id: "s1", campaignName: "Enviada", scheduledAt: "2026-08-11T10:00:00.000Z", status: "sent" },
        { id: "s2", campaignName: "Agendada", scheduledAt: "2026-08-11T11:00:00.000Z", status: "pending" },
        { id: "s3", campaignName: "Falhou", scheduledAt: "2026-08-11T12:00:00.000Z", status: "failed" },
      ],
    },
    10,
  );

  assert.deepEqual(
    feed.map((i) => (i.kind === "broadcast" ? i.campaignName : "")),
    ["Enviada"],
  );
});

test("respeita o limite mantendo o mais recente", () => {
  const leads = Array.from({ length: 20 }, (_, i) => ({
    id: `l${i}`,
    name: `Lead ${i}`,
    enteredAt: new Date(NOW.getTime() - i * 60_000).toISOString(),
  }));

  const feed = buildActivityFeed({ leads, orders: [], schedules: [] }, 10);

  assert.equal(feed.length, 10);
  assert.equal(feed[0].kind === "lead" && feed[0].name, "Lead 0");
});

test("item sem data fica de fora em vez de bagunçar a ordem", () => {
  const feed = buildActivityFeed(
    {
      leads: [{ id: "sem", name: "Sem data", enteredAt: "" }],
      orders: [{ id: "o1", value: 10 }],
      schedules: [],
    },
    10,
  );

  assert.equal(feed.length, 0);
});

test("contato sem nome não vira string vazia na tela", () => {
  const feed = buildActivityFeed(
    { leads: [{ id: "l1", enteredAt: "2026-08-11T17:00:00.000Z" }], orders: [], schedules: [] },
    10,
  );

  assert.equal(feed[0].kind === "lead" && feed[0].name, "Novo contato");
});

test("timeAgo fala em linguagem de gente", () => {
  assert.equal(timeAgo("2026-08-11T17:59:40.000Z", NOW), "agora");
  assert.equal(timeAgo("2026-08-11T17:45:00.000Z", NOW), "há 15 min");
  assert.equal(timeAgo("2026-08-11T15:00:00.000Z", NOW), "há 3 h");
  assert.equal(timeAgo("2026-08-10T17:00:00.000Z", NOW), "ontem");
  assert.equal(timeAgo("2026-08-08T17:00:00.000Z", NOW), "há 3 dias");
});

test("timeAgo não inventa futuro nem quebra com data inválida", () => {
  assert.equal(timeAgo("2026-08-11T18:30:00.000Z", NOW), "agora");
  assert.equal(timeAgo("não é data", NOW), "");
});
