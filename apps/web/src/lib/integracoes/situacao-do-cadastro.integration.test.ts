// apps/web/src/lib/integracoes/situacao-do-cadastro.integration.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { chaveDoTelefone } from "@/lib/pages/phone";
import { lerRelatorioAnuncios, type RelatorioAnuncios } from "@/lib/resultados/relatorio-anuncios";
import { lerPainelDoSite } from "@/lib/stores/painel-do-site";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { situacoesDosCadastros } from "./situacao-do-cadastro";

/**
 * A tela de integração reescreve em TypeScript duas coisas que o banco já faz:
 * `public.phone_key` (como `chaveDoTelefone`) e a regra de crédito de
 * `attribution_report` (como `situacoesDosCadastros`). Este teste roda no
 * Supabase de DEV, numa loja descartável criada aqui e apagada no fim, e
 * reprova se as duas cópias contarem histórias diferentes:
 *
 * - Maria: cadastro pelo A1, entra 5 min depois com o lead SEM o nono dígito.
 * - Bia: cadastro pelo A2, entra e compra R$ 250 num pedido SEM telefone (só lead_id).
 * - João: cadastro pelo A3 quando já estava no grupo desde dezembro.
 *
 * Numa SEGUNDA loja descartável (a tela mostra só os 5 últimos; juntas, as duas lojas
 * tirariam a Maria da tela):
 * - Ana: cadastro pelo A4 e entrada EXATAMENTE 7 dias depois (borda inclusiva da janela).
 * - Carla: cadastros A5 e A6 com 1 h de diferença, mesmo telefone, entrada 30 min depois
 *   do A6: o crédito é do último cadastro (A6); o A5 fica sem entrada.
 */

const LIGADO = Boolean(process.env.E2E_TENANT_ID);
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);

let loja = "";
let lojaBorda = "";

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

function cadastro(tenant: string, evento: string, whatsapp: string, quando: string, anuncio: string) {
  return {
    tenant_id: tenant,
    event_id: `${evento}-${RUN}`,
    whatsapp,
    created_at: quando,
    utm_source: "ig",
    utm_campaign: "C1",
    utm_term: "S1",
    utm_content: anuncio,
  };
}

before(async () => {
  if (pular()) return;
  const [org1, org2] = await inserir("organizations", [
    { name: `sitetest ${RUN}`, slug: `sitetest-${RUN}` },
    { name: `sitetest borda ${RUN}`, slug: `sitetest-borda-${RUN}` },
  ]);
  loja = org1.id;
  lojaBorda = org2.id;

  await inserir("site_captures", [
    cadastro(loja, "maria", "+5562999921111", "2026-01-05T10:00:00-03:00", "A1"),
    cadastro(loja, "bia", "+5562988822222", "2026-01-06T12:00:00-03:00", "A2"),
    cadastro(loja, "joao", "+5562977723333", "2026-01-07T12:00:00-03:00", "A3"),
  ]);
  const [, bia] = await inserir("leads", [
    { tenant_id: loja, phone: "556299921111", entered_at: "2026-01-05T10:05:00-03:00" },
    { tenant_id: loja, phone: "5562988822222", entered_at: "2026-01-06T12:10:00-03:00" },
    { tenant_id: loja, phone: "5562977723333", entered_at: "2025-12-01T12:00:00-03:00" },
  ]);
  await inserir("orders", [
    { tenant_id: loja, phone: "", lead_id: bia.id, value: 250, created_at: "2026-01-10T15:00:00-03:00" },
  ]);

  // Loja da borda: fica separada para que a tela (5 últimos) continue vendo a Maria na loja 1.
  await inserir("site_captures", [
    cadastro(lojaBorda, "ana", "+5562966644444", "2026-01-08T12:00:00-03:00", "A4"),
    cadastro(lojaBorda, "carla1", "+5562955555555", "2026-01-09T10:00:00-03:00", "A5"),
    cadastro(lojaBorda, "carla2", "+5562955555555", "2026-01-09T11:00:00-03:00", "A6"),
  ]);
  await inserir("leads", [
    { tenant_id: lojaBorda, phone: "5562966644444", entered_at: "2026-01-15T12:00:00-03:00" },
    { tenant_id: lojaBorda, phone: "5562955555555", entered_at: "2026-01-09T11:30:00-03:00" },
  ]);
});

after(async () => {
  if (pular()) return;
  // organizations leva o resto junto (on delete cascade).
  const falhas: string[] = [];
  for (const id of [loja, lojaBorda].filter(Boolean)) {
    const { error } = await getSupabaseAdmin().from("organizations").delete().eq("id", id);
    if (error) falhas.push(`${id}: ${error.message}`);
  }
  if (falhas.length) throw new Error(`limpeza incompleta:\n${falhas.join("\n")}`);
});

test("chaveDoTelefone dá a mesma chave que public.phone_key", { skip: pular() }, async () => {
  const casos: (string | null)[] = [
    "(62) 99999-8888",
    "556299998888",
    "+55 62 99999-8888",
    "5562 9999-8888",
    "062999998888",
    "00556299998888",
    "55987654321",
    "999998888",
    "",
    null,
  ];
  for (const caso of casos) {
    const { data, error } = await getSupabaseAdmin().rpc("phone_key", { p: caso });
    if (error) throw new Error(`phone_key(${JSON.stringify(caso)}): ${error.message}`);
    assert.equal(chaveDoTelefone(caso), (data as string | null) ?? null, JSON.stringify(caso));
  }
});

/** A tela (store + TS) e o relatório (SQL) da mesma loja, lado a lado. */
async function lerLoja(tenant: string, recebidos: number) {
  // O store contra o banco de verdade: nomes de coluna, filtros e HEAD+count.
  const painel = await lerPainelDoSite(tenant, "2026-01-01T00:00:00Z");
  assert.equal(painel.recebidos30d, recebidos);
  const naTela = Object.fromEntries(
    situacoesDosCadastros(painel).map((l) => [l.anuncio, l.situacao.replace(/\s/g, " ")]),
  );
  const r = await relatorio(tenant, "2026-01-01", "2026-01-31");
  const anuncio = (nome: string) => {
    const achada = r.linhas.find((l) => l.nivel === "anuncio" && l.anuncio === nome);
    assert.ok(achada, `linha do anúncio ${nome} não veio`);
    return achada;
  };
  // TS × SQL por anúncio: "Entrou…" na tela ⇔ entraram > 0 no relatório (quem comprou
  // mostra "Comprou…", que tem sua própria checagem no teste).
  for (const [nome, texto] of Object.entries(naTela)) {
    if (texto.startsWith("Comprou")) continue;
    assert.equal(texto.startsWith("Entrou"), anuncio(nome).entraram > 0, `${nome}: "${texto}" × relatório`);
  }
  return { naTela, anuncio };
}

test("a situação da tela conta a mesma história que attribution_report", { skip: pular() }, async () => {
  const { naTela, anuncio } = await lerLoja(loja, 3);
  assert.deepEqual(naTela, {
    A3: "Já era do grupo",
    A2: "Comprou · R$ 250,00",
    A1: "Entrou no grupo às 10:05",
  });

  const a1 = anuncio("A1");
  const a2 = anuncio("A2");
  const a3 = anuncio("A3");
  assert.deepEqual([a1.entraram, a1.compradores], [1, 0], "Maria: entrou, não comprou");
  assert.deepEqual([a2.compradores, a2.vendido], [1, 250], "Bia: comprou R$ 250 pelo lead");
  assert.deepEqual([a3.entraram, a3.ja_membros], [0, 1], "João: já era do grupo");
});

test("borda de 7 dias e crédito ao último cadastro: tela e relatório concordam", { skip: pular() }, async () => {
  const { naTela, anuncio } = await lerLoja(lojaBorda, 3);
  const { A4: ana, ...resto } = naTela;
  assert.deepEqual(resto, {
    A6: "Entrou no grupo às 11:30",
    A5: "Ainda não abriu o link do grupo",
  });
  assert.match(ana, /^Entrou no grupo em .* às 12:00$/, "Ana: 7 dias exatos ainda contam");

  assert.equal(anuncio("A4").entraram, 1, "Ana: entrada exatamente 7 dias depois conta");
  assert.equal(anuncio("A5").entraram, 0, "Carla: o cadastro anterior perde o crédito");
  assert.equal(anuncio("A6").entraram, 1, "Carla: o último cadastro leva a entrada");
});
