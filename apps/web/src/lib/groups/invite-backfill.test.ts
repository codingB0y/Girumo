import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInviteFetchMarker,
  classifyInviteFailure,
  clearInviteFetchMarker,
  parseInviteCodeResponse,
  selectBackfillCandidates,
  type BackfillCandidate,
} from "./invite-backfill";

function group(over: Partial<BackfillCandidate> = {}): BackfillCandidate {
  return {
    id: over.id ?? "row-1",
    whatsapp_group_id: over.whatsapp_group_id ?? "120363000000000001@g.us",
    name: over.name ?? "Atacado Infantil 1",
    members: over.members ?? 100,
    is_admin: over.is_admin ?? true,
    invite_url: over.invite_url ?? null,
    metadata: over.metadata ?? {},
  };
}

// --- selectBackfillCandidates ---

test("selects an admin group with no invite", () => {
  const out = selectBackfillCandidates([group()], 10);
  assert.equal(out.length, 1);
});

test("skips a group where we are not admin", () => {
  // Sem admin não existe código de convite a buscar: a chamada gastaria cota
  // do limite e voltaria 404 sempre.
  const out = selectBackfillCandidates([group({ is_admin: false })], 10);
  assert.deepEqual(out, []);
});

test("skips a group that already has an invite", () => {
  const out = selectBackfillCandidates(
    [group({ invite_url: "https://chat.whatsapp.com/AbCdEfGhIjK" })],
    10,
  );
  assert.deepEqual(out, []);
});

test("skips a group whose invite fetch is marked as failed", () => {
  const out = selectBackfillCandidates(
    [group({ metadata: { inviteFetch: { failed: true, reason: "403", at: "2026-08-12T00:00:00.000Z" } } })],
    10,
  );
  assert.deepEqual(out, []);
});

test("respects the limit", () => {
  const many = Array.from({ length: 25 }, (_, i) => group({ id: `row-${i}`, whatsapp_group_id: `${i}@g.us` }));
  assert.equal(selectBackfillCandidates(many, 10).length, 10);
});

test("puts the fullest group first", () => {
  // Ordenar por membros é o que faz os grupos em zona de lotação virem antes,
  // sem nenhum código de prioridade: quem está cheio é quem precisa do link.
  const out = selectBackfillCandidates(
    [
      group({ id: "vazio", whatsapp_group_id: "a@g.us", members: 5 }),
      group({ id: "cheio", whatsapp_group_id: "b@g.us", members: 980 }),
      group({ id: "medio", whatsapp_group_id: "c@g.us", members: 400 }),
    ],
    10,
  );
  assert.deepEqual(out.map((g) => g.id), ["cheio", "medio", "vazio"]);
});

test("does not mutate the input array", () => {
  const input = [
    group({ id: "a", whatsapp_group_id: "a@g.us", members: 1 }),
    group({ id: "b", whatsapp_group_id: "b@g.us", members: 2 }),
  ];
  selectBackfillCandidates(input, 10);
  assert.deepEqual(input.map((g) => g.id), ["a", "b"]);
});

// --- parseInviteCodeResponse ---

test("reads the invite url the Evolution returns", () => {
  const out = parseInviteCodeResponse({
    inviteUrl: "https://chat.whatsapp.com/AbCdEfGhIjK",
    inviteCode: "AbCdEfGhIjK",
  });
  assert.equal(out, "https://chat.whatsapp.com/AbCdEfGhIjK");
});

test("falls back to inviteCode when inviteUrl is absent", () => {
  const out = parseInviteCodeResponse({ inviteCode: "AbCdEfGhIjK" });
  assert.equal(out, "https://chat.whatsapp.com/AbCdEfGhIjK");
});

test("refuses a response whose url is not a WhatsApp invite", () => {
  // Este é o caso que protege o /r/<slug>: um valor errado aqui não quebra o
  // painel, quebra do outro lado — o cliente clica no link divulgado e cai em
  // lugar nenhum.
  assert.equal(parseInviteCodeResponse({ inviteUrl: "https://evil.example/AbCdEfGhIjK" }), null);
});

test("refuses a response with no invite at all", () => {
  assert.equal(parseInviteCodeResponse({}), null);
  assert.equal(parseInviteCodeResponse(null), null);
  assert.equal(parseInviteCodeResponse("No invite code"), null);
});

// --- classifyInviteFailure ---

test("network failure is transient", () => {
  // status 0 é o sinal do EvolutionError para "não chegou na Evolution".
  const out = classifyInviteFailure({ status: 0, detail: "TimeoutError" });
  assert.equal(out.verdict, "transient");
  // O próprio status é o reconhecimento: não depende de adivinhar o detail.
  assert.equal(out.recognized, true);
});

test("server error is transient", () => {
  const out = classifyInviteFailure({ status: 502, detail: "bad gateway" });
  assert.equal(out.verdict, "transient");
  assert.equal(out.recognized, true);
});

test("losing admin is permanent, and says so in Portuguese", () => {
  const out = classifyInviteFailure({ status: 404, detail: "Error: 403 forbidden" });
  assert.equal(out.verdict, "permanent");
  assert.equal(out.reason, "a conta não é mais admin do grupo");
  assert.equal(out.recognized, true);
});

test("a locked group is permanent", () => {
  const out = classifyInviteFailure({ status: 404, detail: "Error: locked" });
  assert.equal(out.verdict, "permanent");
  assert.equal(out.reason, "o grupo está travado para convites");
  assert.equal(out.recognized, true);
});

test("a revoked invite is permanent", () => {
  const out = classifyInviteFailure({ status: 404, detail: "Error: gone" });
  assert.equal(out.verdict, "permanent");
  assert.equal(out.reason, "o convite foi revogado no WhatsApp");
  assert.equal(out.recognized, true);
});

test("an unrecognised detail is permanent and carries the raw detail", () => {
  // Sem tradução conhecida, mostrar o texto cru é melhor que esconder: quem
  // olhar o painel precisa de alguma pista pra decidir se tenta de novo.
  const out = classifyInviteFailure({ status: 404, detail: "quem sabe" });
  assert.equal(out.verdict, "permanent");
  assert.equal(out.reason, "quem sabe");
  // Não reconhecida: um 404 sem padrão conhecido tanto pode ser este grupo
  // quanto a instância inteira fora do ar, e quem chama precisa saber disso
  // antes de tirar o grupo da fila pra sempre.
  assert.equal(out.recognized, false);
});

test("a permanent failure with no detail still has a usable reason", () => {
  assert.equal(classifyInviteFailure({ status: 404 }).verdict, "permanent");
  assert.equal(classifyInviteFailure({ status: 404 }).reason, "a Evolution não devolveu o convite");
  assert.equal(classifyInviteFailure({ status: 404 }).recognized, false);
  assert.equal(classifyInviteFailure({ status: 404, detail: null }).reason, "a Evolution não devolveu o convite");
  assert.equal(classifyInviteFailure({ status: 404, detail: null }).recognized, false);
});

test("a 5xx whose body says locked is still transient", () => {
  // Regressão da ordem: status antes de detail. Um 5xx pode carregar qualquer
  // texto no corpo, e classificar por causa de uma palavra ali mataria um
  // grupo bom para sempre.
  assert.equal(classifyInviteFailure({ status: 503, detail: "upstream locked" }).verdict, "transient");
});

// --- buildInviteFetchMarker ---

test("stamps the failure with reason and time", () => {
  const marker = buildInviteFetchMarker("403 forbidden", new Date("2026-08-12T15:30:00.000Z"));
  assert.deepEqual(marker, { failed: true, reason: "403 forbidden", at: "2026-08-12T15:30:00.000Z" });
});

test("truncates a very long reason", () => {
  const marker = buildInviteFetchMarker("x".repeat(500), new Date("2026-08-12T15:30:00.000Z"));
  assert.equal(marker.reason.length, 200);
});

// --- clearInviteFetchMarker ---

test("clearing the marker returns the group to the queue", () => {
  const cleared = clearInviteFetchMarker({
    inviteFetch: { failed: true, reason: "403", at: "2026-08-12T00:00:00.000Z" },
    outroCampo: "preservado",
  });
  assert.deepEqual(cleared, { outroCampo: "preservado" });
  assert.deepEqual(selectBackfillCandidates([group({ metadata: cleared })], 10).length, 1);
});

test("clearing keeps other metadata untouched and handles empty input", () => {
  assert.deepEqual(clearInviteFetchMarker(null), {});
  assert.deepEqual(clearInviteFetchMarker(undefined), {});
  assert.deepEqual(clearInviteFetchMarker({ a: 1 }), { a: 1 });
});
