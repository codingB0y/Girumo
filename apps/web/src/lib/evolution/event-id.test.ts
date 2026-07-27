import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evolutionEventId, uuidV5 } from "./event-id";
import {
  parseEvolutionWebhook,
  type EvolutionEventName,
  type EvolutionWebhookEvent,
} from "./webhook-schema";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function parsedFixture(name: string): EvolutionWebhookEvent {
  const raw = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));
  const result = parseEvolutionWebhook(raw);
  assert.ok(result.ok, `fixture ${name} deveria parsear`);
  return result.event;
}

/** Igual a `parsedFixture`, mas estreita a união para um evento específico. */
function parsedFixtureOf<E extends EvolutionEventName>(
  name: string,
  event: E,
): Extract<EvolutionWebhookEvent, { event: E }> {
  const parsed = parsedFixture(name);
  assert.equal(parsed.event, event);
  return parsed as Extract<EvolutionWebhookEvent, { event: E }>;
}

const UUID_V5_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("uuidV5 matches the RFC 4122 test vector", () => {
  // Vetor canônico: namespace DNS + "www.example.com".
  assert.equal(
    uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"),
    "2ed6657d-e927-568b-95e1-2665a8aea6a2",
  );
});

test("generated ids are well-formed v5 uuids", () => {
  for (const name of [
    "qrcode-updated",
    "connection-update.open",
    "group-participants-update.add",
    "groups-upsert",
    "messages-update",
  ]) {
    assert.match(evolutionEventId(parsedFixture(name)), UUID_V5_RE);
  }
});

test("the same payload always yields the same id (replay-safe)", () => {
  // É isto que faz o `on conflict (event_id)` do record_engine_event
  // transformar uma reentrega da Evolution em no-op.
  for (const name of ["connection-update.open", "groups-upsert", "messages-update"]) {
    assert.equal(evolutionEventId(parsedFixture(name)), evolutionEventId(parsedFixture(name)));
  }
});

test("add and remove of the same participant are distinct events", () => {
  // Fixtures idênticas exceto pelo `action` — se colidissem, sair de um grupo
  // sobrescreveria a entrada e o lead capture da F3 perderia o evento.
  assert.notEqual(
    evolutionEventId(parsedFixture("group-participants-update.add")),
    evolutionEventId(parsedFixture("group-participants-update.remove")),
  );
});

test("distinct fixtures never collide", () => {
  const ids = [
    "qrcode-updated",
    "connection-update.open",
    "group-participants-update.add",
    "group-participants-update.remove",
    "groups-upsert",
    "messages-update",
  ].map((name) => evolutionEventId(parsedFixture(name)));

  assert.equal(new Set(ids).size, ids.length);
});

test("participant order does not change the id", () => {
  const base = parsedFixtureOf("group-participants-update.add", "group-participants.update");
  const extra = {
    ...base,
    data: {
      ...base.data,
      participants: [
        { id: "20100000000000009@lid" },
        ...base.data.participants,
      ],
    },
  } as EvolutionWebhookEvent;
  const reversed = {
    ...base,
    data: {
      ...base.data,
      participants: [
        ...base.data.participants,
        { id: "20100000000000009@lid" },
      ],
    },
  } as EvolutionWebhookEvent;

  // A Evolution não garante ordem — sem o sort, a mesma entrada reentregue
  // geraria dois eventos e o welcome da F3 sairia duplicado.
  assert.equal(evolutionEventId(extra), evolutionEventId(reversed));
});

test("messages.update ignores the timestamp but tracks the status", () => {
  const base = parsedFixtureOf("messages-update", "messages.update");
  const later = { ...base, date_time: "2099-01-01T00:00:00.000Z" } as EvolutionWebhookEvent;
  // Mesma transição reentregue mais tarde = mesmo evento.
  assert.equal(evolutionEventId(base), evolutionEventId(later));

  const delivered = {
    ...base,
    data: { ...base.data, status: "DELIVERY_ACK" },
  } as EvolutionWebhookEvent;
  // Mas DELIVERY_ACK → READ são transições diferentes que o delivery-tracker
  // (F4) precisa ver separadamente.
  assert.notEqual(evolutionEventId(base), evolutionEventId(delivered));
});

test("the same event from two instances yields different ids", () => {
  const base = parsedFixture("connection-update.open");
  const other = { ...base, instance: "gr_outra-instancia" } as EvolutionWebhookEvent;
  assert.notEqual(evolutionEventId(base), evolutionEventId(other));
});
