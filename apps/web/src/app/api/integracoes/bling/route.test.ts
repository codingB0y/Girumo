import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { selar } from "@/lib/security/secret-box";
import { contextoDoToken } from "@/lib/stores/bling-conexoes";
import {
  bancoDoCartao,
  CAMPANHA_A,
  CAMPANHA_C,
  CHAVE,
  conectada,
  ENV,
  haHoras,
  linha,
  REFRESH,
  servirCartao,
  VERSAO,
  type Chamada,
} from "@/test/bling-cartao-falso";

import { DELETE, GET } from "./route";

/**
 * A rota do cartão do Bling com o dono logado por Bearer contra um PostgREST de mentira, e o Bling num
 * fetch falso (`src/test/bling-cartao-falso.ts`): desconectar (DELETE) e o cartão (GET). Os ajustes
 * (PATCH) estão em `route-ajustes.test.ts`.
 */

const chamadas: Chamada[] = [];
let papel = "owner";
let conexao: Record<string, unknown> | null = null;
let banco: Record<string, unknown> = {};
const revogacoes: string[] = [];
let blingFora = false;

const { gravacoes, doBanco } = servirCartao({
  chamadas,
  revogacoes,
  papel: () => papel,
  conexao: () => conexao,
  banco: () => banco,
  blingFora: () => blingFora,
});
beforeEach(() => {
  Object.assign(process.env, ENV);
  chamadas.length = 0;
  revogacoes.length = 0;
  papel = "owner";
  blingFora = false;
  conexao = linha(selar(REFRESH, contextoDoToken("loja-b", "refresh"), CHAVE));
  banco = bancoDoCartao();
});

function pedir(): Request {
  return new Request("http://girumo.test/api/integracoes/bling", {
    method: "DELETE",
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}

test("dono desconecta: apaga os tokens, solta a trava, revoga o refresh no Bling e responde ok", async () => {
  const resposta = await DELETE(pedir());
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  assert.deepEqual(await resposta.json(), { ok: true });

  const [gravacao] = gravacoes();
  assert.equal(gravacao.url.searchParams.get("tenant_id"), "eq.loja-b");
  const b = gravacao.corpo as Record<string, unknown>;
  assert.deepEqual(
    [b.status, b.access_token_enc, b.refresh_token_enc, b.company_id, b.lease_holder, b.token_version],
    ["desconectada", null, null, null, null, 3],
  );
  assert.deepEqual(revogacoes, [REFRESH]);
});

test("sem conexão: 404 e nada é gravado nem revogado", async () => {
  conexao = null;
  const resposta = await DELETE(pedir());
  assert.equal(resposta.status, 404);
  assert.deepEqual(await resposta.json(), { error: "Sem conexão com o Bling." });
  assert.equal(gravacoes().length, 0);
  assert.deepEqual(revogacoes, []);
});

test("operador e vendedora: 403 sem tocar na conexão", async () => {
  for (const p of ["operator", "seller"]) {
    chamadas.length = 0;
    papel = p;
    assert.equal((await DELETE(pedir())).status, 403, p);
    assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/bling_connections").length, 0);
  }
});

test("revogação que não dá certo não impede a desconexão", async () => {
  // Bling fora do ar.
  blingFora = true;
  assert.equal((await DELETE(pedir())).status, 200);
  assert.deepEqual(revogacoes, [REFRESH]);

  // Cifra de outra loja não abre aqui: nada vai ao Bling.
  revogacoes.length = 0;
  conexao = linha(selar(REFRESH, contextoDoToken("loja-a", "refresh"), CHAVE));
  assert.equal((await DELETE(pedir())).status, 200);
  assert.deepEqual(revogacoes, []);

  // Sem as variáveis do Bling ainda desconecta; só não revoga.
  delete process.env.BLING_CLIENT_SECRET;
  assert.equal((await DELETE(pedir())).status, 200);
  assert.deepEqual(revogacoes, []);
  assert.equal(gravacoes().length, 3);
});

// ── GET: o cartão ────────────────────────────────────────────────────────────

const VAZIO = { conexao: null, historico: null, ajustes: null, numeros_30d: null, listas: null, ultimas: [] };

function pedirCartao(): Request {
  return new Request("http://girumo.test/api/integracoes/bling", {
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}

test("cartão conectado: estado, histórico, ajustes, números do banco e as últimas vendas mascaradas", async () => {
  conexao = conectada();
  const resposta = await GET(pedirCartao());
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");

  assert.deepEqual(await resposta.json(), {
    disponivel: true,
    conexao: {
      status: "ativa",
      empresa: "Moda Kids Atacado Ltda",
      conectada_em: "2026-10-13T12:00:00+00:00",
      ultima_venda_em: conexao.last_sale_at,
      ultimo_aviso_em: conexao.last_webhook_at,
      tempo_real: "ok",
      pausada_ate: null,
      ultimo_erro: "Falta permissão no app do Bling",
    },
    historico: { lidos: 1840, concluido: false },
    ajustes: {
      situacoes: [
        { id: 6, nome: "Em aberto", base: 6, conta: false, bloqueada: false },
        { id: 9, nome: "Atendido", base: 9, conta: true, bloqueada: false },
        { id: 12, nome: "Cancelado", base: 12, conta: false, bloqueada: true },
        { id: 21, nome: "Em digitação", base: 21, conta: false, bloqueada: true },
        { id: 30, nome: "Pago", base: 9, conta: false, bloqueada: false },
      ],
      // A versão das situações mostradas (o hash da lista): o Salvar a devolve junto com as marcadas (409 se mudou no meio).
      situacoes_versao: VERSAO,
      high_value: 1500,
      meta_enabled: true,
      pixel: {
        escolhido: CAMPANHA_A,
        opcoes: [
          { campaign_id: CAMPANHA_A, campanha: "VIP Goiânia", pixel_id: "1234567890" },
          { campaign_id: CAMPANHA_C, campanha: "Moda Sul", pixel_id: "5550001112" },
        ],
      },
      // Com o escopo de canais: o nome que a conta deu e o canal ativo sem pedido também.
      canais: [
        { id: 200000001, nome: "Loja Yampi", tipo: "Yampi", ativo: true, pedidos: 2, exemplos: ["1532", "1531"], ultimo_pedido_em: "2026-10-13", fora_do_meta: false },
        { id: 200000004, nome: "Loja física", tipo: "Api", ativo: true, pedidos: 0, exemplos: [], ultimo_pedido_em: null, fora_do_meta: false },
      ],
    },
    numeros_30d: {
      vendas: 214,
      vendido: 86420.5,
      com_origem: { anuncio: 61, grupo: 97 },
      sem_origem: 56,
      meta: { enviado: 207, fora_da_janela: 6, sem_pixel: 0, sem_dados: 1, desligado: 0, erro: 0 },
      pendentes: 3,
      falhas: 1,
    },
    listas: { alto_valor: 38, comprador: 412, lead: 129 },
    ultimas: [
      {
        hora: "2026-10-13T17:52:00+00:00", cliente: "Ana Paula Ferreira", telefone_mascarado: "(62) 9••••-4821",
        valor: 1840, tipo: "venda", origem: "anuncio", origem_detalhe: "Verão · Kit 10 peças", meta: "enviado", situacao: "Pago",
      },
      {
        hora: "2026-10-13T16:00:00+00:00", cliente: "Regiane Costa", telefone_mascarado: null,
        valor: 312.5, tipo: "pedido", origem: null, origem_detalhe: null, meta: "sem_pixel", situacao: "Em aberto",
      },
    ],
  });

  // Toda consulta é da loja do contexto; os contatos são só os das últimas.
  for (const c of doBanco().filter((x) => x.metodo === "GET")) {
    assert.equal(c.url.searchParams.get("tenant_id"), "eq.loja-b", c.url.pathname);
  }
  const resumo = chamadas.find((c) => c.url.pathname === "/rest/v1/rpc/bling_resumo");
  assert.deepEqual(resumo?.corpo, { p_tenant: "loja-b" });
  const contatos = chamadas.find((c) => c.url.pathname === "/rest/v1/bling_contacts");
  assert.equal(contatos?.url.searchParams.get("bling_contact_id"), "in.(555,556)");
  const pedidos = chamadas.filter((c) => c.url.pathname === "/rest/v1/bling_orders");
  const comCanal = (c: Chamada) => c.url.searchParams.get("select")?.includes("snapshot->lojaId") ?? false;
  assert.equal(pedidos.find((c) => !comCanal(c))?.url.searchParams.get("limit"), "8");
  assert.equal(pedidos.find(comCanal)?.url.searchParams.get("limit"), "1000");
});

test("nenhum token nem telefone inteiro sai no cartão", async () => {
  conexao = conectada();
  const texto = await (await GET(pedirCartao())).text();
  const segredos = [String(conexao.access_token_enc), String(conexao.refresh_token_enc), "EAAB", "TEST123", "5562999994821"];
  for (const segredo of segredos) assert.ok(!texto.includes(segredo), segredo);
  assert.ok(!/token/i.test(texto));
});

test("tempo real: ok, parado (a varredura achou venda e o aviso sumiu) e sem dados", async () => {
  const casos: [Record<string, unknown>, string][] = [
    [{}, "ok"],
    [{ last_webhook_at: haHoras(7), last_scan_change_at: haHoras(1) }, "parado"],
    [{ last_webhook_at: null, last_scan_change_at: null }, "sem_dados"],
  ];
  for (const [over, esperado] of casos) {
    conexao = conectada(over);
    const corpo = await (await GET(pedirCartao())).json();
    assert.equal(corpo.conexao.tempo_real, esperado, JSON.stringify(over));
  }
});

test("sem as variáveis do Bling: cartão indisponível sem consulta nenhuma a dado da loja", async () => {
  for (const faltando of ["BLING_CLIENT_ID", "BLING_CLIENT_SECRET", "INTEGRATIONS_ENCRYPTION_KEY"] as const) {
    Object.assign(process.env, ENV);
    delete process.env[faltando];
    chamadas.length = 0;
    const resposta = await GET(pedirCartao());
    assert.equal(resposta.status, 200);
    assert.deepEqual(await resposta.json(), { disponivel: false, ...VAZIO }, faltando);
    assert.deepEqual(doBanco(), [], faltando);
  }
});

test("sem conexão ou desconectada: disponível e vazio, sem ler mais nada", async () => {
  for (const atual of [null, conectada({ status: "desconectada", company_id: null })]) {
    conexao = atual;
    chamadas.length = 0;
    assert.deepEqual(await (await GET(pedirCartao())).json(), { disponivel: true, ...VAZIO });
    assert.deepEqual(doBanco().map((c) => c.url.pathname), ["/rest/v1/bling_connections"]);
  }
});

test("cartão: operador e vendedora 403 sem tocar em dado da loja", async () => {
  for (const p of ["operator", "seller"]) {
    chamadas.length = 0;
    papel = p;
    assert.equal((await GET(pedirCartao())).status, 403, p);
    assert.deepEqual(doBanco(), [], p);
  }
});

test("a lista de canais falhando não derruba o cartão: os canais fora do Meta seguem nele", async (t) => {
  const avisos = t.mock.method(console, "warn", () => undefined);
  conexao = conectada({ meta_skip_store_ids: ["200000001"] });
  delete banco.canais;
  const resposta = await GET(pedirCartao());
  assert.equal(resposta.status, 200);
  const cartao = (await resposta.json()) as { ajustes: { canais: unknown[] } };
  assert.deepEqual(cartao.ajustes.canais.map((c) => [(c as { id: number }).id, (c as { fora_do_meta: boolean }).fora_do_meta]), [
    [200000001, true],
    [200000004, false],
  ]);
  assert.ok(avisos.mock.calls.some((c) => String(c.arguments[0]).includes("loja-b")));
});

test("cartão com o banco falhando: 500 sem a mensagem do banco", async () => {
  conexao = conectada();
  delete banco["/rest/v1/rpc/bling_resumo"];
  const resposta = await GET(pedirCartao());
  assert.equal(resposta.status, 500);
  assert.ok(!(await resposta.text()).includes("inesperado"));
});
