import test from "node:test";
import assert from "node:assert/strict";
import { GRAPH_API_VERSION, buildCapiPayload, capiEndpoint, firstForwardedIp, sendCapiEvent } from "./meta-capi";

const base = {
  eventName: "Lead",
  eventId: "11111111-2222-3333-4444-555555555555",
  eventTimeMs: 1_756_000_000_000,
  sourceUrl: "https://girumo.com.br/r/grade-verao",
  clientIp: "203.0.113.7",
  userAgent: "Mozilla/5.0 (iPhone)",
  fbclid: null as string | null,
  fbp: null as string | null,
  campaignName: "Grade de verão",
  groupId: "120363001@g.us" as string | null,
};

test("payload: campos obrigatórios da Meta, tempo em SEGUNDOS", () => {
  const e = buildCapiPayload(base).data[0];
  assert.equal(e.event_name, "Lead");
  assert.equal(e.event_id, base.eventId);
  assert.equal(e.event_time, 1_756_000_000); // ms → s
  assert.equal(e.action_source, "website");
  assert.equal(e.event_source_url, base.sourceUrl);
  assert.equal(e.user_data.client_ip_address, "203.0.113.7");
  assert.equal(e.user_data.client_user_agent, base.userAgent);
  assert.deepEqual(e.custom_data, { campaign: "Grade de verão", group: "120363001@g.us" });
});

test("fbc só existe quando há fbclid de verdade", () => {
  assert.equal(buildCapiPayload(base).data[0].user_data.fbc, undefined);
  const comClid = buildCapiPayload({ ...base, fbclid: "IwAR123" });
  assert.equal(comClid.data[0].user_data.fbc, `fb.1.${base.eventTimeMs}.IwAR123`);
});

test("fbp entra só quando o cookie existe", () => {
  assert.equal(buildCapiPayload(base).data[0].user_data.fbp, undefined);
  assert.equal(buildCapiPayload({ ...base, fbp: "fb.1.1.2" }).data[0].user_data.fbp, "fb.1.1.2");
});

test("grupo ausente não vira chave vazia no custom_data", () => {
  assert.deepEqual(buildCapiPayload({ ...base, groupId: null }).data[0].custom_data, { campaign: "Grade de verão" });
});

test("test_event_code só quando pedido", () => {
  assert.equal(buildCapiPayload(base).test_event_code, undefined);
  assert.equal(buildCapiPayload({ ...base, testCode: "TEST123" }).test_event_code, "TEST123");
});

test("payload nunca leva PII crua nem o token", () => {
  const texto = JSON.stringify(buildCapiPayload({ ...base, testCode: "TEST123", fbclid: "IwAR123" }));
  for (const proibido of ["email", "phone", "access_token"]) {
    assert.equal(texto.includes(proibido), false, `payload não pode conter ${proibido}`);
  }
});

test("endpoint fixa a versão da Graph API numa constante", () => {
  assert.equal(capiEndpoint("1234567890"), `https://graph.facebook.com/${GRAPH_API_VERSION}/1234567890/events`);
});

test("firstForwardedIp pega o PRIMEIRO da lista, ignora vazio", () => {
  assert.equal(firstForwardedIp("203.0.113.7, 70.41.3.18"), "203.0.113.7");
  assert.equal(firstForwardedIp("  203.0.113.7  "), "203.0.113.7");
  assert.equal(firstForwardedIp(null), null);
  assert.equal(firstForwardedIp(""), null);
});

test("sendCapiEvent: manda o token no CORPO e devolve events_received", async () => {
  const chamadas: Array<{ url: string; body: string }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init: RequestInit) => {
    chamadas.push({ url: String(url), body: String(init.body) });
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  }) as unknown as typeof fetch;
  try {
    const r = await sendCapiEvent({ pixelId: "1234567890", token: "EAAsegredo", payload: buildCapiPayload(base) });
    assert.equal(r.ok, true);
    assert.equal(r.eventsReceived, 1);
    assert.equal(chamadas[0].url.includes("EAAsegredo"), false, "token não pode ir na URL");
    assert.equal(JSON.parse(chamadas[0].body).access_token, "EAAsegredo");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("sendCapiEvent: erro da Meta NÃO lança, devolve ok:false com a mensagem", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "Invalid OAuth token" } }), {
      status: 400,
    })) as unknown as typeof fetch;
  try {
    const r = await sendCapiEvent({ pixelId: "1234567890", token: "ruim", payload: buildCapiPayload(base) });
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /Invalid OAuth token/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("sendCapiEvent: rede caída NÃO lança", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  try {
    const r = await sendCapiEvent({ pixelId: "1234567890", token: "x", payload: buildCapiPayload(base) });
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /ECONNREFUSED/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
