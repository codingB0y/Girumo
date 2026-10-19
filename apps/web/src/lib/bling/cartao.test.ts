import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, test } from "node:test";

import { SITUACOES_PADRAO } from "@/lib/bling/classificar";
import type { ConexaoBling } from "@/lib/stores/bling-conexoes";
import type { ContatoGuardado } from "@/lib/stores/bling-contatos";
import type { LinhaPedidoBling, ResumoBling } from "@/lib/stores/bling-pedidos";
import type { CampaignGroup } from "@/lib/stores/campaign-groups";

import {
  canaisDoCartao,
  cartaoConectado,
  montarCartao,
  opcoesDoPixel,
  situacoesDoCartao,
  tempoReal,
  ultimasVendas,
  ultimoErro,
  versaoDasSituacoes,
} from "./cartao";

/** O mapeamento do cartão sem rede: a rota e a store têm os testes delas. */

const AGORA = new Date("2026-10-13T18:00:00.000Z");
const HORA_MS = 3_600_000;
const haHoras = (h: number) => new Date(AGORA.getTime() - h * HORA_MS).toISOString();
const CAMPANHA_A = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const CAMPANHA_B = "7d6c5b4a-3e2f-4a1b-8c9d-0e1f2a3b4c5d";
const CAMPANHA_C = "0e1f2a3b-4c5d-4e6f-8a9b-1c2d3e4f5a6b";

const SITUACOES = [
  { id: 6, nome: "Em aberto", base: 6 },
  { id: 9, nome: "Atendido", base: 9 },
  { id: 12, nome: "Cancelado", base: 12 },
  { id: 21, nome: "Em digitação", base: 21 },
  { id: 30, nome: "Pago", base: 9 },
  { id: 31, nome: "Estornado", base: 12 },
];

const CONEXAO: ConexaoBling = {
  tenantId: "loja-b",
  companyId: "empresa-1",
  companyName: "Moda Kids Atacado Ltda",
  status: "ativa",
  accessTokenEnc: "v1.selado-acesso",
  refreshTokenEnc: "v1.selado-refresh",
  accessExpiresAt: haHoras(-5),
  tokenVersion: 3,
  situations: SITUACOES,
  situationsAt: haHoras(2),
  saleSituationIds: [9, 30],
  highValue: 1500,
  metaEnabled: true,
  metaCampaignId: CAMPANHA_A,
  metaSkipStoreIds: [],
  backfillFrom: "2026-07-15",
  backfillUntil: "2026-10-13",
  backfillPage: 4,
  backfillFails: 0,
  backfillDoneAt: null,
  scanCursor: haHoras(0.1),
  pausedUntil: null,
  consecutiveFailures: 0,
  lastWebhookAt: haHoras(1),
  lastScanAt: haHoras(0.1),
  lastScanChangeAt: haHoras(3),
  lastSaleAt: haHoras(0.2),
  lastError: null,
  lastErrorAt: null,
  reconnectAlertedAt: null,
  connectedAt: "2026-10-13T12:00:00.000Z",
  keyFp: null,
  tokenRetryAt: null,
  scanFrom: null,
  scanSliceS: null,
};

function campanha(id: string, name: string, meta: Record<string, string> | null): CampaignGroup {
  return {
    id,
    tenant_id: "loja-b",
    name,
    slug: name.toLowerCase().replace(/\s/g, "-"),
    group_ids: [],
    auto_grow: false,
    grow_template: null,
    metadata: meta ? { settings: { integracoes: { meta } } } : {},
    whatsapp_community_jid: null,
    created_at: "2026-10-01T12:00:00+00:00",
    updated_at: "2026-10-01T12:00:00+00:00",
  };
}

const CAMPANHAS = [
  campanha(CAMPANHA_A, "VIP Goiânia", { pixel_id: "1234567890", capi_token: "EAAB-token-secreto", test_code: "TEST123" }),
  campanha(CAMPANHA_B, "VIP Kids", { pixel_id: "1234567890" }), // sem token: não envia pelo servidor
  campanha(CAMPANHA_C, "Moda Sul", { pixel_id: "5550001112", capi_token: "EAAB-outro-token" }),
];

const ANA: ContatoGuardado = {
  blingContactId: 555,
  name: "Ana Paula Ferreira",
  personType: "F",
  phone: "5562999994821",
  phoneKey: "6299994821",
  metaHashes: { ph: ["hash-do-telefone"] },
  lista: "alto_valor",
  fetchedAt: haHoras(1),
};
const SEM_TELEFONE: ContatoGuardado = { ...ANA, blingContactId: 556, name: "Regiane Costa", phone: null, phoneKey: null };

function pedido(over: Partial<LinhaPedidoBling>): LinhaPedidoBling {
  return {
    tenantId: "loja-b",
    blingOrderId: 1,
    numero: "1",
    orderDate: "2026-10-13",
    total: 100,
    situacaoId: 9,
    blingContactId: 555,
    kind: "venda",
    orderId: null,
    origin: "aviso",
    firstSeenAt: haHoras(2),
    saleAt: haHoras(1),
    icStatus: "enviado",
    purchaseStatus: "enviado",
    metaError: null,
    origem: "grupo",
    origemDetalhe: "VIP Kids 12",
    snapshot: null,
    pending: false,
    attempts: 0,
    nextTryAt: haHoras(1),
    lastError: null,
    updatedAt: haHoras(1),
    ...over,
  };
}

const RESUMO: ResumoBling = {
  vendas_30d: 214,
  vendido_30d: 86420.5,
  origem_30d: { anuncio: 61, grupo: 97, sem_origem: 56 },
  meta_30d: { enviado: 207, fora_da_janela: 6, sem_pixel: 0, sem_dados: 1, desligado: 0, erro: 0 },
  pendentes: 3,
  falhas: 1,
  historico_lidos: 1840,
  listas: { alto_valor: 38, comprador: 412, lead: 129 },
};

test("tempo real: aviso nas últimas 6 h é ok; sem aviso e com venda achada pela varredura depois dele é parado; o resto, sem dados", () => {
  const casos: [string | null, string | null, string][] = [
    [haHoras(1), haHoras(3), "ok"],
    [haHoras(6), null, "ok"], // 6 h em ponto ainda é recebendo
    [new Date(AGORA.getTime() - 6 * HORA_MS - 1).toISOString(), haHoras(1), "parado"],
    [null, haHoras(1), "parado"], // nunca houve aviso e a varredura achou mudança
    [haHoras(7), haHoras(8), "sem_dados"], // a varredura não achou nada depois do último aviso
    [haHoras(7), null, "sem_dados"],
    [null, null, "sem_dados"],
  ];
  for (const [aviso, mudanca, esperado] of casos) {
    const c = { ...CONEXAO, lastWebhookAt: aviso, lastScanChangeAt: mudanca };
    assert.equal(tempoReal(c, AGORA), esperado, `aviso ${aviso} · varredura ${mudanca}`);
  }
});

test("último erro: sempre quando o Bling recusou o acesso; senão só o das últimas 24 h", () => {
  const erro = "Falta permissão no app do Bling";
  assert.equal(ultimoErro({ ...CONEXAO, lastError: erro, lastErrorAt: haHoras(23) }, AGORA), erro);
  assert.equal(ultimoErro({ ...CONEXAO, lastError: erro, lastErrorAt: haHoras(25) }, AGORA), null);
  assert.equal(ultimoErro({ ...CONEXAO, lastError: erro, lastErrorAt: null }, AGORA), null);
  assert.equal(ultimoErro({ ...CONEXAO, status: "reconectar", lastError: erro, lastErrorAt: haHoras(72) }, AGORA), erro);
});

test("situações: as da conta, marcadas as que contam; Cancelado, Em digitação e quem herda delas travadas e nunca contam", () => {
  assert.deepEqual(situacoesDoCartao({ ...CONEXAO, saleSituationIds: [9, 30, 31] }), [
    { id: 6, nome: "Em aberto", base: 6, conta: false, bloqueada: false },
    { id: 9, nome: "Atendido", base: 9, conta: true, bloqueada: false },
    { id: 12, nome: "Cancelado", base: 12, conta: false, bloqueada: true },
    { id: 21, nome: "Em digitação", base: 21, conta: false, bloqueada: true },
    { id: 30, nome: "Pago", base: 9, conta: true, bloqueada: false },
    // Na lista guardada por engano: o motor não conta, o cartão também não.
    { id: 31, nome: "Estornado", base: 12, conta: false, bloqueada: true },
  ]);
});

test("loja que nunca escolheu as situações de venda: marca o padrão calculado agora (Atendido e as filhas dele)", () => {
  const lista = situacoesDoCartao({ ...CONEXAO, saleSituationIds: [] });
  // É o que o motor conta como venda: a tela não pode mostrar nada marcado.
  assert.deepEqual(lista.filter((s) => s.conta).map((s) => s.nome), ["Atendido", "Pago"]);
});

test("versão das situações: muda com a lista (uma situação a mais, outro nome, a primeira carga), nunca com a hora da releitura", () => {
  const versao = versaoDasSituacoes(SITUACOES);
  assert.match(versao, /^[0-9a-f]{16}$/);
  // O motor relê a cada 24 h (e na situação desconhecida) e grava a hora: a mesma lista, relida, é a mesma versão.
  assert.equal(versaoDasSituacoes(structuredClone(SITUACOES)), versao);
  const outras = [[...SITUACOES, { id: 32, nome: "Pago no Pix", base: 9 }], SITUACOES.map((s) => (s.id === 30 ? { ...s, nome: "Pago!" } : s)), []];
  for (const lista of outras) assert.notEqual(versaoDasSituacoes(lista), versao, JSON.stringify(lista));
});

test("situações que não carregaram: as padrão do Bling", () => {
  const lista = situacoesDoCartao({ ...CONEXAO, situations: [], saleSituationIds: [9] });
  assert.deepEqual(
    lista.map((s) => s.id),
    SITUACOES_PADRAO.map((s) => s.id),
  );
  assert.deepEqual(
    lista.filter((s) => s.conta).map((s) => s.nome),
    ["Atendido"],
  );
});

test("pixel: só campanhas com pixel e token, com o nome, sem token nem código de teste", () => {
  const opcoes = opcoesDoPixel(CAMPANHAS);
  assert.deepEqual(opcoes, [
    { campaign_id: CAMPANHA_A, campanha: "VIP Goiânia", pixel_id: "1234567890" },
    { campaign_id: CAMPANHA_C, campanha: "Moda Sul", pixel_id: "5550001112" },
  ]);
  assert.ok(!JSON.stringify(opcoes).includes("EAAB"));
  assert.ok(!JSON.stringify(opcoes).includes("TEST123"));
});

test("últimas: telefone mascarado, hora da venda (ou de quando chegou), status do evento certo e nome da situação", () => {
  const linhas = [
    pedido({ blingOrderId: 3, total: 1840, situacaoId: 30, origem: "anuncio", origemDetalhe: "Verão · Kit 10 peças" }),
    pedido({ blingOrderId: 2, kind: "pedido", total: 312.5, saleAt: null, situacaoId: 6, blingContactId: 556, origem: null, origemDetalhe: null, icStatus: "sem_pixel", purchaseStatus: null }),
    pedido({ blingOrderId: 1, total: null, situacaoId: 99, blingContactId: null, purchaseStatus: "fora_da_janela" }),
  ];

  assert.deepEqual(ultimasVendas(linhas, [ANA, SEM_TELEFONE], SITUACOES), [
    {
      hora: haHoras(1),
      cliente: "Ana Paula Ferreira",
      telefone_mascarado: "(62) 9••••-4821",
      valor: 1840,
      tipo: "venda",
      origem: "anuncio",
      origem_detalhe: "Verão · Kit 10 peças",
      meta: "enviado",
      situacao: "Pago",
    },
    {
      hora: haHoras(2), // pedido não tem hora de venda: vale quando chegou
      cliente: "Regiane Costa",
      telefone_mascarado: null,
      valor: 312.5,
      tipo: "pedido",
      origem: null,
      origem_detalhe: null,
      meta: "sem_pixel", // pedido mostra o InitiateCheckout
      situacao: "Em aberto",
    },
    {
      hora: haHoras(1),
      cliente: null,
      telefone_mascarado: null,
      valor: null,
      tipo: "venda",
      origem: "grupo",
      origem_detalhe: "VIP Kids 12",
      meta: "fora_da_janela",
      situacao: null, // situação que a conta não conhece
    },
  ]);
});

test("cartão conectado inteiro: números do banco, ajustes, pixel escolhido e nenhum token", () => {
  const cartao = cartaoConectado({
    conexao: { ...CONEXAO, pausedUntil: haHoras(-1), lastError: "limite", lastErrorAt: haHoras(2) },
    resumo: RESUMO,
    linhas: [pedido({})],
    contatos: [ANA],
    campanhas: CAMPANHAS,
    canais: [{ lojaId: 204937216, numero: "1532", orderDate: "2026-10-12" }],
    agora: AGORA,
  });

  assert.deepEqual(cartao.conexao, {
    status: "ativa",
    empresa: "Moda Kids Atacado Ltda",
    conectada_em: "2026-10-13T12:00:00.000Z",
    ultima_venda_em: haHoras(0.2),
    ultimo_aviso_em: haHoras(1),
    tempo_real: "ok",
    pausada_ate: haHoras(-1),
    ultimo_erro: "limite",
  });
  assert.deepEqual(cartao.historico, { lidos: 1840, concluido: false });
  assert.equal(cartao.ajustes?.high_value, 1500);
  assert.equal(cartao.ajustes?.meta_enabled, true);
  assert.equal(cartao.ajustes?.pixel.escolhido, CAMPANHA_A);
  assert.deepEqual(cartao.ajustes?.canais, [
    { id: 204937216, pedidos: 1, exemplos: ["1532"], ultimo_pedido_em: "2026-10-12", fora_do_meta: false },
  ]);
  assert.equal(cartao.ajustes?.situacoes.length, SITUACOES.length);
  // A versão das situações mostradas (o PATCH confere com ela): o hash do conteúdo da lista, não a hora em que foi lida.
  assert.equal(cartao.ajustes?.situacoes_versao, createHash("sha256").update(JSON.stringify(SITUACOES)).digest("hex").slice(0, 16));
  assert.deepEqual(cartao.numeros_30d, {
    vendas: 214,
    vendido: 86420.5,
    com_origem: { anuncio: 61, grupo: 97 },
    sem_origem: 56,
    meta: { enviado: 207, fora_da_janela: 6, sem_pixel: 0, sem_dados: 1, desligado: 0, erro: 0 },
    pendentes: 3,
    falhas: 1,
  });
  assert.deepEqual(cartao.listas, { alto_valor: 38, comprador: 412, lead: 129 });
  assert.equal(cartao.ultimas.length, 1);
  assert.equal(cartao.disponivel, true);

  const texto = JSON.stringify(cartao);
  for (const segredo of ["selado", "EAAB", "TEST123", "token", "5562999994821"]) assert.ok(!texto.includes(segredo), segredo);
});

test("pausa vencida não aparece; histórico terminado; escolha de campanha que perdeu o pixel não volta", () => {
  const cartao = cartaoConectado({
    conexao: { ...CONEXAO, pausedUntil: haHoras(1), backfillDoneAt: haHoras(24), metaCampaignId: CAMPANHA_B },
    resumo: RESUMO,
    linhas: [],
    contatos: [],
    campanhas: CAMPANHAS,
    canais: [],
    agora: AGORA,
  });
  assert.equal(cartao.conexao?.pausada_ate, null);
  assert.equal(cartao.historico?.concluido, true);
  // Devolver a B faria o "Salvar ajustes" voltar 400 (ela não tem token).
  assert.equal(cartao.ajustes?.pixel.escolhido, null);
  assert.deepEqual(cartao.ultimas, []);
});

test("canais: um por loja.id, na ordem do pedido mais novo, com quantos pedidos, até 3 números e o dia do último", () => {
  const YAMPI = 204937216;
  const NUVEM = 205291049;
  const canais = canaisDoCartao(
    [
      { lojaId: YAMPI, numero: "1532", orderDate: "2026-10-18" },
      { lojaId: NUVEM, numero: null, orderDate: null },
      { lojaId: YAMPI, numero: null, orderDate: "2026-10-17" },
      { lojaId: NUVEM, numero: "880", orderDate: "2026-10-16" },
      { lojaId: YAMPI, numero: "1530", orderDate: "2026-10-15" },
      { lojaId: YAMPI, numero: "1529", orderDate: "2026-10-14" },
      { lojaId: YAMPI, numero: "1528", orderDate: "2026-10-13" },
    ],
    [NUVEM],
  );
  assert.deepEqual(canais, [
    { id: YAMPI, pedidos: 5, exemplos: ["1532", "1530", "1529"], ultimo_pedido_em: "2026-10-18", fora_do_meta: false },
    { id: NUVEM, pedidos: 2, exemplos: ["880"], ultimo_pedido_em: "2026-10-16", fora_do_meta: true },
  ]);
});

test("canal tirado do Meta que não aparece nos pedidos recentes continua na lista (dá para devolvê-lo ao envio)", () => {
  assert.deepEqual(canaisDoCartao([{ lojaId: 1, numero: "10", orderDate: "2026-10-18" }], [7, 1]), [
    { id: 1, pedidos: 1, exemplos: ["10"], ultimo_pedido_em: "2026-10-18", fora_do_meta: true },
    { id: 7, pedidos: 0, exemplos: [], ultimo_pedido_em: null, fora_do_meta: true },
  ]);
  assert.deepEqual(canaisDoCartao([], []), []);
});

const VARIAVEIS = ["BLING_CLIENT_ID", "BLING_CLIENT_SECRET", "INTEGRATIONS_ENCRYPTION_KEY", "SUPABASE_URL"] as const;

beforeEach(() => {
  for (const v of VARIAVEIS) delete process.env[v];
});

// Quando a integração está disponível (as credenciais E a chave): `blingDisponivel`, em deps.test.ts.
test("indisponível: o cartão vazio sai sem consulta nenhuma (o banco nem está configurado aqui)", async () => {
  // Sem SUPABASE_URL qualquer consulta lançaria: o cartão vai ao ar antes da DDL.
  assert.deepEqual(await montarCartao("loja-b", AGORA), {
    disponivel: false,
    conexao: null,
    historico: null,
    ajustes: null,
    numeros_30d: null,
    listas: null,
    ultimas: [],
  });
});
