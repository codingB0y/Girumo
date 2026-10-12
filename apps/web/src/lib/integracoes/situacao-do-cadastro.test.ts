// apps/web/src/lib/integracoes/situacao-do-cadastro.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cadastroCreditado,
  situacoesDosCadastros,
  type CadastroLido,
  type HistoricoDosCadastros,
} from "./situacao-do-cadastro";

const DIA_MS = 86_400_000;
const mais = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

/** 14:52 em Brasília (UTC−3). */
const T0 = "2026-10-10T17:52:00.000Z";

function cadastro(id: string, criado: string, over: Partial<CadastroLido> = {}): CadastroLido {
  return {
    id,
    whatsapp: "+5562999994821",
    phone_key: "6299994821",
    utm_campaign: "Verão",
    utm_content: "Verão Kids — vídeo 15s",
    created_at: criado,
    ...over,
  };
}

function historico(over: Partial<HistoricoDosCadastros>): HistoricoDosCadastros {
  return { ultimos: [], daChave: [], leads: [], pedidos: [], comClique: new Set(), ...over };
}

/** O `Intl` separa "R$" do número com espaço não separável. */
const texto = (s: string) => s.replace(/\s/g, " ");

test("entrou no mesmo dia: hora de Brasília; lead gravado sem o 9 casa pela chave", () => {
  const [linha] = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      leads: [{ id: "l1", phone: "556299994821", entered_at: mais(T0, 60_000) }],
    }),
  );
  assert.deepEqual(linha, {
    hora: T0,
    telefone_mascarado: "(62) 9••••-4821",
    anuncio: "Verão Kids — vídeo 15s",
    situacao: "Entrou no grupo às 14:53",
  });
});

test("entrou em outro dia: a data vai junto da hora", () => {
  const [linha] = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: "2026-10-12T12:05:00.000Z" }],
    }),
  );
  assert.equal(linha.situacao, "Entrou no grupo em 12/10 às 09:05");
});

test("janela de 7 dias: a borda conta, um milissegundo depois não", () => {
  const dentro = situacoesDosCadastros(
    historico({ ultimos: [cadastro("c1", T0)], leads: [{ id: "l1", phone: "5562999994821", entered_at: mais(T0, 7 * DIA_MS) }] }),
  );
  assert.match(dentro[0].situacao, /^Entrou no grupo em /);

  const fora = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: mais(T0, 7 * DIA_MS + 1) }],
      comClique: new Set(["c1"]),
    }),
  );
  assert.equal(fora[0].situacao, "Foi pro grupo, ainda não entrou");
});

test("mesma pessoa com dois cadastros: o mais novo leva a entrada, o antigo não", () => {
  const antigo = cadastro("c-antigo", mais(T0, -2 * 3_600_000));
  const novo = cadastro("c-novo", T0);
  const linhas = situacoesDosCadastros(
    historico({
      ultimos: [novo, antigo],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: mais(T0, 30 * 60_000) }],
    }),
  );
  assert.deepEqual(
    linhas.map((l) => l.situacao),
    ["Entrou no grupo às 15:22", "Ainda não abriu o link do grupo"],
  );
});

test("o cadastro mais novo que não está entre os 5 últimos também tira o crédito", () => {
  const [linha] = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      daChave: [{ id: "c-depois", phone_key: "6299994821", created_at: mais(T0, 60_000) }],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: mais(T0, 120_000) }],
    }),
  );
  assert.equal(linha.situacao, "Ainda não abriu o link do grupo");
});

test("já era do grupo: primeira entrada antes do cadastro, mesmo com clique", () => {
  const [linha] = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: "2026-09-01T12:00:00.000Z" }],
      comClique: new Set(["c1"]),
    }),
  );
  assert.equal(linha.situacao, "Já era do grupo");
});

test("comprou: soma os pedidos creditados; sem telefone vale o do lead; pedido de outra pessoa não entra", () => {
  const [linha] = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: mais(T0, 60_000) }],
      pedidos: [
        { id: "o1", phone: "", lead_id: "l1", value: "720", created_at: mais(T0, DIA_MS) },
        { id: "o2", phone: "5562999994821", lead_id: null, value: 30.5, created_at: mais(T0, 2 * DIA_MS) },
        // ligado ao mesmo lead, mas com telefone de outra pessoa: a chave é a do pedido
        { id: "o3", phone: "5511987654321", lead_id: "l1", value: 999, created_at: mais(T0, DIA_MS) },
        // fora da janela de 90 dias
        { id: "o4", phone: "5562999994821", lead_id: null, value: 500, created_at: mais(T0, 90 * DIA_MS + 1) },
      ],
    }),
  );
  assert.equal(texto(linha.situacao), "Comprou · R$ 750,50");
});

test("comprou vence já era do grupo (o pedido depois do cadastro conta normalmente)", () => {
  const [linha] = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: "2026-09-01T12:00:00.000Z" }],
      pedidos: [{ id: "o1", phone: "5562999994821", lead_id: null, value: 100, created_at: mais(T0, DIA_MS) }],
    }),
  );
  assert.equal(texto(linha.situacao), "Comprou · R$ 100,00");
});

test("anúncio: utm_content, senão utm_campaign, senão (sem UTM)", () => {
  const linhas = situacoesDosCadastros(
    historico({
      ultimos: [
        cadastro("a", T0),
        cadastro("b", T0, { utm_content: "  " }),
        cadastro("c", T0, { utm_content: null, utm_campaign: null }),
      ],
    }),
  );
  assert.deepEqual(linhas.map((l) => l.anuncio), ["Verão Kids — vídeo 15s", "Verão", "(sem UTM)"]);
});

test("crédito: empate no mesmo instante vai para o id maior, como no banco", () => {
  const cadastros = [
    { id: "a", phone_key: "6299994821", created_at: T0 },
    { id: "b", phone_key: "6299994821", created_at: T0 },
    { id: "z", phone_key: "1111111111", created_at: T0 },
  ];
  assert.equal(cadastroCreditado("6299994821", mais(T0, 1000), DIA_MS, cadastros), "b");
  assert.equal(cadastroCreditado("6299994821", mais(T0, -1), DIA_MS, cadastros), null);
});
