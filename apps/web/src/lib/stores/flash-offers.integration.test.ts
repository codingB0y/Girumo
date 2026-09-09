import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { getSupabaseAdmin } from "@/lib/supabase/server";

import {
  claimNext,
  closeOffer,
  insertEntry,
  listQueue,
  releaseExpired,
  settleClaim,
} from "./flash-offers";

/**
 * Contra o Supabase de DEV. As regras testadas aqui vivem em índices e RPCs —
 * teste unitário não as alcança, e é exatamente entre os elos que o defeito mora.
 */

const TENANT = process.env.E2E_TENANT_ID ?? "";
const GRUPO_WA = "120363999999999999@g.us";
let offerId = "";
let groupId = "";

before(async () => {
  if (!TENANT) return;
  const supabase = getSupabaseAdmin();

  const { data: grupo } = await supabase
    .from("groups")
    .select("id")
    .eq("tenant_id", TENANT)
    .limit(1)
    .maybeSingle();
  groupId = grupo?.id ?? "";

  const { data: oferta } = await supabase
    .from("flash_offers")
    .insert({
      tenant_id: TENANT,
      name: "teste",
      keyword: "eu quero",
      slots: 2,
      timer_seconds: 60,
      status: "open",
      opened_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  offerId = oferta!.id;

  await supabase.from("flash_offer_groups").insert({
    tenant_id: TENANT,
    offer_id: offerId,
    group_id: groupId,
    whatsapp_group_id: GRUPO_WA,
    opened_at: new Date(Date.now() - 60_000).toISOString(),
  });
});

after(async () => {
  if (!TENANT || !offerId) return;
  await getSupabaseAdmin().from("flash_offers").delete().eq("id", offerId);
});

function pular(): boolean {
  if (!TENANT) {
    console.log("E2E_TENANT_ID ausente — teste de integração pulado");
    return true;
  }
  return false;
}

const entrada = (n: number, quando: Date) => ({
  tenantId: TENANT,
  offerId,
  groupId,
  whatsappGroupId: GRUPO_WA,
  participantJid: `${n}@lid`,
  phone: null,
  pushName: `Cliente ${n}`,
  messageText: "eu quero",
  messageId: `MSG${n}`,
  commentedAt: quando,
});

test("mesmo message_id duas vezes vira uma entrada só", async (t) => {
  if (pular()) return t.skip();
  const agora = new Date();
  assert.equal(await insertEntry(entrada(1, agora)), true);
  assert.equal(await insertEntry(entrada(1, agora)), false);
});

test("mesma pessoa comentando de novo ocupa um lugar só", async (t) => {
  if (pular()) return t.skip();
  const outraMensagem = { ...entrada(1, new Date()), messageId: "MSG1-BIS" };
  assert.equal(await insertEntry(outraMensagem), false);
});

test("claim além de slots é recusado", async (t) => {
  if (pular()) return t.skip();
  await insertEntry(entrada(2, new Date(Date.now() + 1000)));
  await insertEntry(entrada(3, new Date(Date.now() + 2000)));

  const a = await claimNext(TENANT, offerId, crypto.randomUUID());
  const b = await claimNext(TENANT, offerId, crypto.randomUUID());
  const c = await claimNext(TENANT, offerId, crypto.randomUUID());

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  // slots = 2. O terceiro não passa.
  assert.equal(c.ok, false);
  if (!c.ok) assert.equal(c.motivo, "sem_vaga");
});

test("segunda oferta aberta no mesmo grupo é recusada pelo banco", async (t) => {
  if (pular()) return t.skip();
  const supabase = getSupabaseAdmin();
  const { data: outra } = await supabase
    .from("flash_offers")
    .insert({ tenant_id: TENANT, name: "conflito", slots: 1, status: "open" })
    .select("id")
    .single();

  const { error } = await supabase.from("flash_offer_groups").insert({
    tenant_id: TENANT,
    offer_id: outra!.id,
    group_id: groupId,
    whatsapp_group_id: GRUPO_WA,
  });

  assert.equal(error?.code, "23505");
  await supabase.from("flash_offers").delete().eq("id", outra!.id);
});

test("expirada sem chamar mantém a posição; depois de chamada vai para o fim", async (t) => {
  if (pular()) return t.skip();
  const supabase = getSupabaseAdmin();
  const passado = new Date(Date.now() - 3600_000).toISOString();

  const { data: claims } = await supabase
    .from("flash_offer_claims")
    .select("id, entry_id")
    .eq("offer_id", offerId)
    .is("released_at", null);

  // Uma venceu sem contato, a outra venceu depois de chamada.
  await supabase.from("flash_offer_claims").update({ claimed_at: passado }).eq("id", claims![0].id);
  await supabase
    .from("flash_offer_claims")
    .update({ claimed_at: passado, contacted_at: passado })
    .eq("id", claims![1].id);

  const liberados = await releaseExpired(TENANT, offerId);
  assert.ok(liberados >= 2);

  const fila = await listQueue(TENANT, offerId);
  const semContato = fila.find((e) => e.id === claims![0].entry_id);
  const comContato = fila.find((e) => e.id === claims![1].entry_id);

  assert.equal(semContato?.deprioritized_at, null, "a loja falhou: a cliente mantém a posição");
  assert.ok(comContato?.deprioritized_at, "a cliente sumiu: vai para o fim");

  // A ORDEM, não só o carimbo. Sem esta asserção um `nullsFirst` invertido em
  // listQueue passa despercebido — e quem sumiu apareceria no TOPO da fila, na
  // frente de quem nunca foi chamada.
  const posSemContato = fila.findIndex((e) => e.id === claims![0].entry_id);
  const posComContato = fila.findIndex((e) => e.id === claims![1].entry_id);
  assert.ok(
    posComContato > posSemContato,
    `quem sumiu fica atrás de quem ficou (pos ${posComContato} vs ${posSemContato})`,
  );
});

test("venda consome vaga para sempre", async (t) => {
  if (pular()) return t.skip();
  const novo = await claimNext(TENANT, offerId, crypto.randomUUID());
  assert.equal(novo.ok, true);
  if (!novo.ok) return;

  await settleClaim(TENANT, novo.claimId, "sold");
  const fila = await listQueue(TENANT, offerId);
  assert.equal(fila.find((e) => e.id === novo.entryId)?.outcome, "sold");
});

test("fechar a oferta libera o grupo: nova oferta no mesmo grupo não leva 409", async (t) => {
  if (pular()) return t.skip();
  const supabase = getSupabaseAdmin();

  // Última: deixa a oferta principal do fixture fechada para o resto do arquivo.
  await closeOffer(TENANT, offerId);

  const { data: linha } = await supabase
    .from("flash_offer_groups")
    .select("closed_at")
    .eq("offer_id", offerId)
    .eq("group_id", groupId)
    .single();
  assert.ok(linha?.closed_at, "closeOffer deve carimbar closed_at na flash_offer_groups filha");

  const { data: nova, error: erroNova } = await supabase
    .from("flash_offers")
    .insert({ tenant_id: TENANT, name: "reaproveita grupo", slots: 1, status: "open" })
    .select("id")
    .single();
  assert.equal(erroNova, null);

  const { error: erroJanela } = await supabase.from("flash_offer_groups").insert({
    tenant_id: TENANT,
    offer_id: nova!.id,
    group_id: groupId,
    whatsapp_group_id: GRUPO_WA,
  });

  assert.equal(
    erroJanela,
    null,
    "índice único não deveria bloquear: o grupo foi liberado pelo closeOffer",
  );

  await supabase.from("flash_offers").delete().eq("id", nova!.id);
});
