import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { lerRelatorioAnuncios, type LinhaRelatorio, type RelatorioAnuncios } from "./relatorio-anuncios";

/**
 * `attribution_report` contra o Supabase de DEV, em duas lojas descartáveis
 * criadas aqui e apagadas no fim. Cada caso da spec §1 tem uma pessoa:
 *
 * - Maria (6299911111): cadastro m1 pelo A1, entra 5 min depois SEM o nono dígito,
 *   compra R$ 600 (pedido com telefone); cadastra de novo pelo A2 já sendo membro
 *   e compra R$ 400 num pedido SEM telefone, só com lead_id.
 * - Bia: entra exatamente 7 dias depois do cadastro → conta.
 * - João: entra 7 dias e 1 minuto depois → não conta (vai para "fora").
 * - Ana: compra exatamente 90 dias depois → conta; 90 dias e 1 minuto → "fora".
 * - Sem UTM: cadastro sem parâmetros vai para a linha campanha null.
 * - Contato sem telefone e pedido sem telefone nem lead → "fora".
 * - Gasto: C1 R$ 100 de 01 a 10/01 (proporcional) e C9 R$ 90 sem nenhum cadastro.
 * - Loja grande: 1.500 cadastros + 1.500 entradas, e um cadastro com o telefone da
 *   Maria na campanha C1 que NUNCA pode aparecer no relatório da primeira loja.
 */

const LIGADO = Boolean(process.env.E2E_TENANT_ID);
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);
const LOTE = 1500;

let loja = "";
let lojaGrande = "";

function pular(): boolean {
  if (EM_PRODUCAO) {
    console.log("SUPABASE_URL é de produção — teste de integração pulado");
    return true;
  }
  if (!LIGADO) {
    console.log("E2E_TENANT_ID ausente — teste de integração pulado");
    return true;
  }
  return false;
}

async function inserir(tabela: string, linhas: Record<string, unknown>[]): Promise<{ id: string }[]> {
  const { data, error } = await getSupabaseAdmin().from(tabela).insert(linhas).select("id");
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return data as { id: string }[];
}

async function relatorio(tenant: string, de: string, ate: string): Promise<RelatorioAnuncios> {
  const { data, error } = await getSupabaseAdmin().rpc("attribution_report", { p_tenant: tenant, p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  return lerRelatorioAnuncios(data);
}

function linha(r: RelatorioAnuncios, nivel: LinhaRelatorio["nivel"], campanha: string | null, conjunto: string | null = null, anuncio: string | null = null): LinhaRelatorio {
  const achada = r.linhas.find(
    (l) => l.nivel === nivel && l.campanha === campanha && l.conjunto === conjunto && l.anuncio === anuncio,
  );
  assert.ok(achada, `linha ${nivel} ${campanha}/${conjunto}/${anuncio} não veio`);
  return achada;
}

function cadastro(tenant: string, evento: string, whatsapp: string, quando: string, utm: { origem?: string; campanha?: string; conjunto?: string; anuncio?: string }) {
  return {
    tenant_id: tenant,
    event_id: `${evento}-${RUN}`,
    whatsapp,
    created_at: quando,
    utm_source: utm.origem ?? null,
    utm_campaign: utm.campanha ?? null,
    utm_term: utm.conjunto ?? null,
    utm_content: utm.anuncio ?? null,
  };
}

before(async () => {
  if (pular()) return;
  const [org1, org2] = await inserir("organizations", [
    { name: `attrtest ${RUN}`, slug: `attrtest-${RUN}` },
    { name: `attrtest grande ${RUN}`, slug: `attrtest-grande-${RUN}` },
  ]);
  loja = org1.id;
  lojaGrande = org2.id;

  const [link] = await inserir("tracked_links", [
    { tenant_id: loja, slug: `attrtest-${RUN}`, target_url: "https://chat.whatsapp.com/teste" },
  ]);

  const [m1] = await inserir("site_captures", [
    cadastro(loja, "m1", "+5562999911111", "2026-01-05T10:00:00-03:00", { origem: "ig", campanha: "C1", conjunto: "S1", anuncio: "A1" }),
    cadastro(loja, "m2", "+5562999911111", "2026-01-24T09:00:00-03:00", { origem: "fb", campanha: "C1", conjunto: "S1", anuncio: "A2" }),
    cadastro(loja, "b1", "+5562988882222", "2026-01-06T12:00:00-03:00", { origem: "ig", campanha: "C1", conjunto: "S1", anuncio: "A1" }),
    cadastro(loja, "j1", "+5562977773333", "2026-01-07T12:00:00-03:00", { origem: "fb", campanha: "C1", conjunto: "S2", anuncio: "A3" }),
    cadastro(loja, "a1", "+5511966664444", "2026-01-08T12:00:00-03:00", { origem: "ig", campanha: "C2" }),
    cadastro(loja, "s1", "+5562955555555", "2026-01-09T12:00:00-03:00", {}),
  ]);
  // insert(...).select("id") devolve na ordem do envio: m1 é o primeiro.
  await inserir("link_click_events", [{ tenant_id: loja, tracked_link_id: link.id, capture_id: m1.id }]);

  const [l1] = await inserir("leads", [
    { tenant_id: loja, phone: "556299911111", entered_at: "2026-01-05T10:05:00-03:00" },
    { tenant_id: loja, phone: "5562988882222", entered_at: "2026-01-13T12:00:00-03:00" },
    { tenant_id: loja, phone: "5562977773333", entered_at: "2026-01-14T12:01:00-03:00" },
    { tenant_id: loja, phone: "5511966664444", entered_at: "2026-01-08T12:30:00-03:00" },
    { tenant_id: loja, phone: null, entered_at: "2026-01-10T12:00:00-03:00" },
  ]);

  await inserir("orders", [
    { tenant_id: loja, phone: "556299911111", lead_id: l1.id, value: 600, created_at: "2026-01-14T15:00:00-03:00" },
    { tenant_id: loja, phone: "", lead_id: l1.id, value: 400, created_at: "2026-01-26T11:00:00-03:00" },
    { tenant_id: loja, phone: "5511966664444", value: 300, created_at: "2026-04-08T12:00:00-03:00" },
    { tenant_id: loja, phone: "5511966664444", value: 50, created_at: "2026-04-08T12:01:00-03:00" },
    { tenant_id: loja, phone: "", value: 70, created_at: "2026-01-11T12:00:00-03:00" },
  ]);

  await inserir("ad_spend", [
    { tenant_id: loja, utm_campaign: "C1", starts_on: "2026-01-01", ends_on: "2026-01-10", amount: 100 },
    { tenant_id: loja, utm_campaign: "C9", starts_on: "2026-01-01", ends_on: "2026-01-31", amount: 90 },
  ]);

  // Loja grande: a chave da Maria na campanha C1 (isolamento) + 1.500 pessoas.
  const base = Date.parse("2026-02-01T10:00:00-03:00");
  const capturas = [cadastro(lojaGrande, "intrusa", "+5562999911111", "2026-01-05T09:00:00-03:00", { campanha: "C1" })];
  const entradas: Record<string, unknown>[] = [];
  for (let i = 0; i < LOTE; i++) {
    const numero = `629${String(i).padStart(8, "0")}`;
    capturas.push(cadastro(lojaGrande, `g${i}`, `+55${numero}`, new Date(base + i * 1000).toISOString(), { campanha: "CX" }));
    entradas.push({ tenant_id: lojaGrande, phone: `55${numero}`, entered_at: new Date(base + i * 1000 + 60_000).toISOString() });
  }
  await inserir("site_captures", capturas);
  await inserir("leads", entradas);
});

after(async () => {
  if (pular()) return;
  // organizations leva o resto junto (on delete cascade).
  const falhas: string[] = [];
  for (const id of [loja, lojaGrande].filter(Boolean)) {
    const { error } = await getSupabaseAdmin().from("organizations").delete().eq("id", id);
    if (error) falhas.push(`${id}: ${error.message}`);
  }
  if (falhas.length) throw new Error(`limpeza incompleta:\n${falhas.join("\n")}`);
});

test("regras da §1: crédito, janelas, já era membro, sem UTM, gasto e fora", { skip: pular() }, async () => {
  const r = await relatorio(loja, "2026-01-01", "2026-04-30");

  assert.deepEqual(r.total, {
    cadastros: 6, foram: 1, entraram: 3, ja_membros: 1,
    compradores: 2, pedidos: 3, vendido: 1300, gasto: 190,
  });

  const c1 = linha(r, "campanha", "C1");
  assert.deepEqual(
    [c1.cadastros, c1.foram, c1.entraram, c1.ja_membros, c1.compradores, c1.pedidos, c1.vendido, c1.gasto],
    [4, 1, 2, 1, 1, 2, 1000, 100],
  );

  const a1 = linha(r, "anuncio", "C1", "S1", "A1");
  assert.deepEqual([a1.cadastros, a1.foram, a1.entraram, a1.pedidos, a1.vendido, a1.gasto], [2, 1, 2, 1, 600, null]);

  const a2 = linha(r, "anuncio", "C1", "S1", "A2");
  assert.deepEqual([a2.cadastros, a2.entraram, a2.ja_membros, a2.compradores, a2.vendido], [1, 0, 1, 1, 400]);

  const s2 = linha(r, "conjunto", "C1", "S2");
  assert.deepEqual([s2.cadastros, s2.entraram], [1, 0]);

  const c2 = linha(r, "campanha", "C2");
  assert.deepEqual([c2.cadastros, c2.entraram, c2.pedidos, c2.vendido], [1, 1, 1, 300]);

  const semUtm = linha(r, "campanha", null);
  assert.equal(semUtm.cadastros, 1);

  const c9 = linha(r, "campanha", "C9");
  assert.deepEqual([c9.cadastros, c9.gasto], [0, 90]);

  assert.deepEqual(r.fora, { entradas_sem_cadastro: 2, pedidos_sem_origem: 2, vendido_sem_origem: 120 });

  const ig = r.por_origem.find((o) => o.origem === "ig");
  assert.deepEqual([ig?.cadastros, ig?.vendido], [3, 900]);
});

test("gasto entra proporcional aos dias do período", { skip: pular() }, async () => {
  const r = await relatorio(loja, "2026-01-06", "2026-01-31");
  assert.equal(linha(r, "campanha", "C1").gasto, 50);
  assert.equal(linha(r, "campanha", "C9").gasto, 75.48);
});

test("loja grande: nada corta em 1000 e a outra loja nunca vaza", { skip: pular() }, async () => {
  const grande = await relatorio(lojaGrande, "2026-02-01", "2026-02-28");
  const cx = linha(grande, "campanha", "CX");
  assert.deepEqual([cx.cadastros, cx.entraram], [LOTE, LOTE]);

  const pequena = await relatorio(loja, "2026-01-01", "2026-04-30");
  assert.equal(linha(pequena, "campanha", "C1").cadastros, 4);
});

test("período inválido vira erro com mensagem", { skip: pular() }, async () => {
  const { error } = await getSupabaseAdmin().rpc("attribution_report", { p_tenant: loja, p_de: "2026-02-01", p_ate: "2026-01-01" });
  assert.match(error?.message ?? "", /periodo invalido/);
  const longo = await getSupabaseAdmin().rpc("attribution_report", { p_tenant: loja, p_de: "2025-01-01", p_ate: "2026-04-30" });
  assert.match(longo.error?.message ?? "", /periodo invalido/);
});
