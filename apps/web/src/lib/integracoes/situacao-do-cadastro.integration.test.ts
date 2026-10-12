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
 */

const LIGADO = Boolean(process.env.E2E_TENANT_ID);
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);

let loja = "";

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

async function relatorio(de: string, ate: string): Promise<RelatorioAnuncios> {
  const { data, error } = await getSupabaseAdmin().rpc("attribution_report", { p_tenant: loja, p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  return lerRelatorioAnuncios(data);
}

function cadastro(evento: string, whatsapp: string, quando: string, anuncio: string) {
  return {
    tenant_id: loja,
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
  const [org] = await inserir("organizations", [{ name: `sitetest ${RUN}`, slug: `sitetest-${RUN}` }]);
  loja = org.id;

  await inserir("site_captures", [
    cadastro("maria", "+5562999921111", "2026-01-05T10:00:00-03:00", "A1"),
    cadastro("bia", "+5562988822222", "2026-01-06T12:00:00-03:00", "A2"),
    cadastro("joao", "+5562977723333", "2026-01-07T12:00:00-03:00", "A3"),
  ]);
  const [, bia] = await inserir("leads", [
    { tenant_id: loja, phone: "556299921111", entered_at: "2026-01-05T10:05:00-03:00" },
    { tenant_id: loja, phone: "5562988822222", entered_at: "2026-01-06T12:10:00-03:00" },
    { tenant_id: loja, phone: "5562977723333", entered_at: "2025-12-01T12:00:00-03:00" },
  ]);
  await inserir("orders", [
    { tenant_id: loja, phone: "", lead_id: bia.id, value: 250, created_at: "2026-01-10T15:00:00-03:00" },
  ]);
});

after(async () => {
  if (pular() || !loja) return;
  // organizations leva o resto junto (on delete cascade).
  const { error } = await getSupabaseAdmin().from("organizations").delete().eq("id", loja);
  if (error) throw new Error(`limpeza incompleta: ${loja}: ${error.message}`);
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

test("a situação da tela conta a mesma história que attribution_report", { skip: pular() }, async () => {
  // O store contra o banco de verdade: nomes de coluna, filtros e HEAD+count.
  const painel = await lerPainelDoSite(loja, "2026-01-01T00:00:00Z");
  assert.equal(painel.recebidos30d, 3);
  const naTela = Object.fromEntries(
    situacoesDosCadastros(painel).map((l) => [l.anuncio, l.situacao.replace(/\s/g, " ")]),
  );
  assert.deepEqual(naTela, {
    A3: "Já era do grupo",
    A2: "Comprou · R$ 250,00",
    A1: "Entrou no grupo às 10:05",
  });

  const r = await relatorio("2026-01-01", "2026-01-31");
  const anuncio = (nome: string) => {
    const achada = r.linhas.find((l) => l.nivel === "anuncio" && l.anuncio === nome);
    assert.ok(achada, `linha do anúncio ${nome} não veio`);
    return achada;
  };
  const a1 = anuncio("A1");
  const a2 = anuncio("A2");
  const a3 = anuncio("A3");
  assert.deepEqual([a1.entraram, a1.compradores], [1, 0], "Maria: entrou, não comprou");
  assert.deepEqual([a2.compradores, a2.vendido], [1, 250], "Bia: comprou R$ 250 pelo lead");
  assert.deepEqual([a3.entraram, a3.ja_membros], [0, 1], "João: já era do grupo");
});
