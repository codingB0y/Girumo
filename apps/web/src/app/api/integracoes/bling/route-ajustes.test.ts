import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { diaDoBling } from "@/lib/bling/api";
import { situacoesDoCartao } from "@/lib/bling/cartao";
import { selar } from "@/lib/security/secret-box";
import { contextoDoToken } from "@/lib/stores/bling-conexoes";
import {
  bancoDoCartao,
  CAMPANHA_A,
  CAMPANHA_C,
  CAMPANHA_SEM_TOKEN,
  CHAVE,
  conectada,
  ENV,
  linha,
  REFRESH,
  servirCartao,
  SITUACOES as SITUACOES_DA_LOJA,
  VERSAO,
  versaoDe,
  type Chamada,
} from "@/test/bling-cartao-falso";

import { PATCH } from "./route";

/**
 * Os ajustes do cartão do Bling (PATCH) com o dono logado por Bearer contra um PostgREST de mentira
 * (`src/test/bling-cartao-falso.ts`): o que reabre pedidos, o que recalcula as listas, o que grava e o que
 * recusa. As situações vêm sempre com a versão (o hash da lista) que o formulário mostrou: a lista mudou no
 * meio, 409. Desconectar e o cartão (GET) estão em `route.test.ts`.
 */

/** A versão das situações de `conectada()` que o formulário viu, no corpo do Salvar. */
const VISTA = { situacoes_versao: VERSAO };
const RECARREGUE = "As situações do Bling mudaram desde que você abriu os ajustes. Recarregue a página e confira quais contam como venda.";
const NAO_REPROCESSOU = "Não deu para reprocessar os pedidos com o ajuste novo; nada foi alterado. Tente salvar de novo.";

const chamadas: Chamada[] = [];
let papel = "owner";
let conexao: Record<string, unknown> | null = null;
let banco: Record<string, unknown> = {};
let recusar: (c: Chamada) => boolean = () => false;

const { gravacoes, doBanco } = servirCartao({
  chamadas,
  papel: () => papel,
  conexao: () => conexao,
  banco: () => banco,
  recusar: (c) => recusar(c),
});
beforeEach(() => {
  Object.assign(process.env, ENV);
  chamadas.length = 0;
  papel = "owner";
  conexao = linha(selar(REFRESH, contextoDoToken("loja-b", "refresh"), CHAVE));
  banco = bancoDoCartao();
  recusar = () => false;
});

function ajustar(corpo: unknown): Request {
  return new Request("http://girumo.test/api/integracoes/bling", {
    method: "PATCH",
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

const reabrir = (c: Chamada) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/bling_orders";
const reaberturas = () => chamadas.filter(reabrir);
/**
 * Os dias reabertos (a store reabre em mais de um UPDATE: o que já estava na fila — o `gte` vai no `or`, junto com a
 * linha sem dia — e o que volta), todos da loja.
 */
const reabertos = () => {
  for (const c of reaberturas()) assert.equal(c.url.searchParams.get("tenant_id"), "eq.loja-b");
  const dia = (c: Chamada) => /gte\.[\d-]+/.exec(c.url.searchParams.get("order_date") ?? c.url.searchParams.get("or") ?? "")?.[0];
  return [...new Set(reaberturas().map(dia))];
};
const recalculos = () => chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/bling_recompute_lists");
const diaHaDias = (dias: number) => diaDoBling(new Date(Date.now() - dias * 86_400_000));
const gravado = () => {
  assert.equal(gravacoes().length, 1);
  assert.equal(gravacoes()[0].url.searchParams.get("tenant_id"), "eq.loja-b");
  return gravacoes()[0].corpo as Record<string, unknown>;
};

test("situações de venda mudaram: grava ordenado e SÓ DEPOIS reabre 90 dias; não recalcula as listas", async () => {
  conexao = conectada();
  const resposta = await PATCH(ajustar({ sale_situation_ids: [30, 9], ...VISTA }));
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  assert.deepEqual(await resposta.json(), { ok: true });

  assert.deepEqual(gravado().sale_situation_ids, [9, 30]);
  // A versão só confere: não vai para o banco.
  assert.ok(!("situacoes_versao" in gravado()));
  assert.deepEqual(reabertos(), [`gte.${diaHaDias(90)}`]);
  // Mutante (reabre e só depois grava): o lote que listasse a linha reaberta antes da gravação a processava com o
  // ajuste velho e a gravação guardada passava. O motor lista antes de reler a conexão: gravado antes, ele vê o novo.
  assert.ok(reaberturas().length > 0 && reaberturas().every((c) => chamadas.indexOf(c) > chamadas.indexOf(gravacoes()[0])));
  assert.equal(recalculos().length, 0);
});

/** A gravação da conexão sem a hora (`updated_at`), para comparar os campos. */
const semHora = (c: Chamada) => Object.fromEntries(Object.entries(c.corpo as Record<string, unknown>).filter(([k]) => k !== "updated_at"));

test("reabrir os pedidos falha: desfaz a gravação (os mesmos campos, com o valor de antes) e responde 500 sem recalcular", async (t) => {
  const erros = t.mock.method(console, "error", () => undefined);
  recusar = reabrir;
  // [conexão de antes, corpo, o que grava, o que desfaz]
  const casos: Record<string, unknown>[][] = [
    [{}, { sale_situation_ids: [30, 9], ...VISTA, high_value: 2000 }, { sale_situation_ids: [9, 30], high_value: 2000 }, { sale_situation_ids: [9], high_value: 1500 }],
    // A loja que nunca escolheu volta ao vazio (o padrão na hora), não ao padrão de agora congelado.
    [{ sale_situation_ids: [] }, { sale_situation_ids: [9], ...VISTA }, { sale_situation_ids: [9] }, { sale_situation_ids: [] }],
    [{ meta_enabled: false }, { meta_enabled: true, meta_campaign_id: CAMPANHA_C }, { meta_enabled: true, meta_campaign_id: CAMPANHA_C }, { meta_enabled: false, meta_campaign_id: CAMPANHA_A }],
  ];
  for (const [antes, corpo, grava, desfaz] of casos) {
    const caso = JSON.stringify(corpo);
    conexao = conectada(antes);
    chamadas.length = 0;
    const resposta = await PATCH(ajustar(corpo));
    assert.equal(resposta.status, 500, caso);
    assert.equal(resposta.headers.get("cache-control"), "no-store");
    assert.deepEqual(await resposta.json(), { error: NAO_REPROCESSOU }, caso);
    // Mutante (sem desfazer): o ajuste novo ficava gravado sem reprocessar, e a nova tentativa acharia tudo igual.
    assert.deepEqual(gravacoes().map(semHora), [grava, desfaz], caso);
    assert.ok(gravacoes().every((g) => g.url.searchParams.get("tenant_id") === "eq.loja-b"), caso);
    const [gravou, desfez] = gravacoes().map((g) => chamadas.indexOf(g));
    assert.ok(gravou < chamadas.indexOf(reaberturas()[0]) && chamadas.indexOf(reaberturas()[0]) < desfez, caso);
    assert.equal(recalculos().length, 0, caso);
  }
  // Cada falha vai ao log com a loja.
  assert.equal(erros.mock.callCount(), casos.length);
  assert.ok(erros.mock.calls.every((c) => String(c.arguments[0]).includes("loja-b")));
});

test("desfazer que também falha: 500 do mesmo jeito, e o log diz a loja", async (t) => {
  const erros = t.mock.method(console, "error", () => undefined);
  conexao = conectada();
  // O banco recusa a reabertura e a gravação seguinte, a que desfaria.
  recusar = (c) => reabrir(c) || (c.metodo === "PATCH" && gravacoes().length > 1);
  const resposta = await PATCH(ajustar({ sale_situation_ids: [30, 9], ...VISTA }));

  assert.equal(resposta.status, 500);
  assert.deepEqual(await resposta.json(), { error: NAO_REPROCESSOU });
  assert.equal(gravacoes().length, 2);
  const linhas = erros.mock.calls.map((c) => String(c.arguments[0]));
  assert.ok(linhas.some((l) => l.includes("loja-b") && /desfazer/.test(l)), linhas.join("\n"));
});

test("loja que nunca escolheu: salvar o padrão de agora não grava escolha nem reabre; tirar uma situação dele grava e reabre 90 dias", async () => {
  conexao = conectada({ sale_situation_ids: [] });
  assert.equal((await PATCH(ajustar({ sale_situation_ids: [30, 9], ...VISTA }))).status, 200);
  // Vazio continua sendo o padrão calculado na hora: uma filha de Atendido criada depois entra sozinha.
  assert.deepEqual(["sale_situation_ids" in gravado(), reaberturas().length], [false, 0]);

  conexao = conectada({ sale_situation_ids: [] });
  chamadas.length = 0;
  assert.equal((await PATCH(ajustar({ sale_situation_ids: [9], ...VISTA }))).status, 200);
  assert.deepEqual(gravado().sale_situation_ids, [9]);
  assert.deepEqual(reabertos(), [`gte.${diaHaDias(90)}`]);
});

test("loja que nunca escolheu salva o formulário inteiro (o padrão marcado e o valor alto): o padrão não congela (prova R2-S1)", async () => {
  // Atendido é o padrão; "Pago" ainda não existe no Bling.
  const situations = [{ id: 6, nome: "Em aberto", base: 6 }, { id: 9, nome: "Atendido", base: 9 }];
  conexao = conectada({ sale_situation_ids: [], situations });
  const marcadas = situacoesDoCartao({ situations, saleSituationIds: [] }).filter((s) => s.conta).map((s) => s.id);
  // As situações marcadas vão junto com o valor alto mudado.
  const corpo = { sale_situation_ids: marcadas, situacoes_versao: versaoDe(situations), high_value: 2000, meta_enabled: true, meta_campaign_id: CAMPANHA_A };
  assert.equal((await PATCH(ajustar(corpo))).status, 200);

  // Mutante (a prova): o padrão [9] ia para o banco como escolha, e o "Pago" criado depois virava pedido para sempre.
  const b = gravado();
  assert.deepEqual([b.high_value, "sale_situation_ids" in b, reaberturas().length], [2000, false, 0]);
});

test("a lista de situações mudou com o formulário aberto (prova R3): as marcadas com a versão vista são 409, sem reabrir nem gravar nada", async () => {
  const semPago = SITUACOES_DA_LOJA.filter((s) => s.id !== 30);
  const comMais = [...SITUACOES_DA_LOJA, { id: 31, nome: "Pago no Pix", base: 9 }];
  // [a lista que o formulário mostrou, a que o motor releu antes do Salvar]: "Pago" chegou; nunca tinham carregado
  // (o cartão mostrava as padrão); uma situação a mais.
  const casos: [readonly unknown[], readonly unknown[]][] = [[semPago, SITUACOES_DA_LOJA], [[], SITUACOES_DA_LOJA], [SITUACOES_DA_LOJA, comMais]];
  for (const [vista, noBanco] of casos) {
    conexao = conectada({ sale_situation_ids: [], situations: noBanco });
    chamadas.length = 0;
    const corpo = { sale_situation_ids: [9], situacoes_versao: versaoDe(vista), high_value: 1500, meta_enabled: true, meta_campaign_id: null };
    const resposta = await PATCH(ajustar(corpo));
    assert.equal(resposta.status, 409, `${vista.length} → ${noBanco.length}`);
    assert.equal(resposta.headers.get("cache-control"), "no-store");
    assert.deepEqual(await resposta.json(), { error: RECARREGUE });
    // Antes: o padrão de antes da releitura ia para o banco como escolha e os 90 dias reabriam (a venda em "Pago" virava pedido).
    assert.deepEqual([gravacoes().length, reaberturas().length, recalculos().length], [0, 0, 0], `${vista.length} → ${noBanco.length}`);
  }

  // O formulário que não mexeu nas caixas não manda as situações: o resto salva, e a escolha continua vazia (o padrão na hora).
  conexao = conectada({ sale_situation_ids: [], situations: [...SITUACOES_DA_LOJA, { id: 31, nome: "Pago no Pix", base: 9 }] });
  chamadas.length = 0;
  assert.equal((await PATCH(ajustar({ high_value: 2000, meta_enabled: true, meta_campaign_id: CAMPANHA_A }))).status, 200);
  assert.deepEqual(["sale_situation_ids" in gravado(), gravado().high_value, reaberturas().length], [false, 2000, 0]);
});

test("situações relidas com a mesma lista (só a hora mudou, em qualquer formato): o Salvar com a versão vista passa (R4)", async () => {
  // O motor grava `situations_at` a cada releitura (24 h, situação desconhecida): a versão é a do conteúdo, não a da hora.
  for (const lidasEm of ["2026-10-13T15:00:00.123+00:00", "2026-10-13T15:00:00+00:00", "2026-10-13T15:00:00.123456+00:00", null]) {
    conexao = conectada({ situations_at: lidasEm });
    chamadas.length = 0;
    const resposta = await PATCH(ajustar({ sale_situation_ids: [9, 30], ...VISTA }));
    // Mutante (a versão pela hora): 409 sem nada ter mudado, e a dona não conseguia salvar.
    assert.equal(resposta.status, 200, String(lidasEm));
    assert.deepEqual([gravado().sale_situation_ids, reabertos()], [[9, 30], [`gte.${diaHaDias(90)}`]], String(lidasEm));
  }
});

test("valor alto mudou: grava e só então recalcula a loja inteira; não reabre pedido", async () => {
  for (const novo of [2000, null]) {
    conexao = conectada();
    chamadas.length = 0;
    assert.equal((await PATCH(ajustar({ high_value: novo }))).status, 200);
    assert.equal(gravado().high_value, novo);
    const [recalculo] = recalculos();
    assert.deepEqual(recalculo.corpo, { p_tenant: "loja-b", p_contact: null });
    // O recálculo lê o valor alto da conexão: antes de gravar ele usaria o antigo.
    assert.ok(chamadas.indexOf(gravacoes()[0]) < chamadas.indexOf(recalculo));
    assert.equal(reaberturas().length, 0);
  }
});

test("Meta religado ou outro pixel: reabre os 7 dias que o Meta ainda aceita", async () => {
  const casos: [Record<string, unknown>, Record<string, unknown>][] = [
    [{ meta_enabled: false }, { meta_enabled: true }],
    [{}, { meta_campaign_id: CAMPANHA_C }],
    [{}, { meta_campaign_id: null }],
  ];
  for (const [antes, corpo] of casos) {
    conexao = conectada(antes);
    chamadas.length = 0;
    assert.equal((await PATCH(ajustar(corpo))).status, 200, JSON.stringify(corpo));
    assert.deepEqual(reabertos(), [`gte.${diaHaDias(7)}`], JSON.stringify(corpo));
  }
});

test("situações e Meta juntos: uma reabertura só, a de 90 dias", async () => {
  conexao = conectada({ meta_enabled: false });
  assert.equal((await PATCH(ajustar({ sale_situation_ids: [9, 30], ...VISTA, meta_enabled: true }))).status, 200);
  assert.deepEqual(reabertos(), [`gte.${diaHaDias(90)}`]);
});

test("nada mudou (ou Meta desligado): grava e não reabre nem recalcula", async () => {
  const corpos = [
    { sale_situation_ids: [9], ...VISTA, high_value: 1500, meta_enabled: true, meta_campaign_id: CAMPANHA_A },
    { meta_campaign_id: CAMPANHA_A.toUpperCase() }, // o mesmo uuid em caixa alta
    { meta_enabled: false },
  ];
  for (const corpo of corpos) {
    conexao = conectada();
    chamadas.length = 0;
    assert.equal((await PATCH(ajustar(corpo))).status, 200, JSON.stringify(corpo));
    if ("meta_campaign_id" in corpo) assert.equal(gravado().meta_campaign_id, CAMPANHA_A); // o banco devolve em minúsculas
    assert.equal(gravacoes().length, 1);
    // A mesma escolha não é regravada: só o que mudou vai para o banco.
    assert.ok(!("sale_situation_ids" in gravado()), JSON.stringify(corpo));
    assert.deepEqual([reaberturas().length, recalculos().length], [0, 0], JSON.stringify(corpo));
  }
});

test("corpo inválido: 400 com a mensagem certa e nada é lido nem gravado", async () => {
  const SITUACOES = "Marque de 1 a 50 situações que contam como venda.";
  const VALOR = "Valor alto: maior que zero, até R$ 10.000.000,00 e com até 2 casas decimais.";
  const SEM_VERSAO = "Recarregue a página e confira quais contam como venda.";
  const casos: [unknown, string][] = [
    ["{", "JSON inválido."],
    [{}, "Nada para salvar."],
    [null, "Ajustes inválidos."],
    [[9], "Ajustes inválidos."],
    [{ sale_situation_ids: [9], ...VISTA, token: "x" }, "Campo desconhecido nos ajustes."],
    [{ sale_situation_ids: [], ...VISTA }, SITUACOES],
    [{ sale_situation_ids: Array.from({ length: 51 }, (_, i) => i + 1), ...VISTA }, SITUACOES],
    [{ sale_situation_ids: [9.5], ...VISTA }, SITUACOES],
    [{ sale_situation_ids: "9", ...VISTA }, SITUACOES],
    // As situações vêm sempre com a versão que o formulário mostrou (16 hex), e a versão sozinha não salva nada.
    [{ sale_situation_ids: [9] }, SEM_VERSAO],
    [{ sale_situation_ids: [9], situacoes_versao: "ontem" }, SEM_VERSAO],
    [{ sale_situation_ids: [9], situacoes_versao: null }, SEM_VERSAO],
    [{ ...VISTA }, SEM_VERSAO],
    [{ ...VISTA, high_value: 1500 }, SEM_VERSAO],
    [{ high_value: 0 }, VALOR],
    [{ high_value: -10 }, VALOR],
    [{ high_value: 10_000_000.01 }, VALOR],
    [{ high_value: 10.555 }, VALOR],
    [{ high_value: "1500" }, VALOR],
    [{ meta_enabled: "sim" }, "Enviar ao Meta: escolha ligado ou desligado."],
    [{ meta_campaign_id: "vip-goiania" }, "Campanha do pixel inválida."],
  ];
  conexao = conectada();
  for (const [corpo, mensagem] of casos) {
    chamadas.length = 0;
    const resposta = await PATCH(ajustar(corpo));
    assert.equal(resposta.status, 400, JSON.stringify(corpo));
    assert.deepEqual(await resposta.json(), { error: mensagem }, JSON.stringify(corpo));
    assert.deepEqual(doBanco(), [], JSON.stringify(corpo));
  }
});

test("valor alto no limite e com centavos passa", async () => {
  for (const valor of [10_000_000, 0.29, 1500.5]) {
    conexao = conectada();
    chamadas.length = 0;
    assert.equal((await PATCH(ajustar({ high_value: valor }))).status, 200, String(valor));
    assert.equal(gravado().high_value, valor);
  }
});

test("situação bloqueada, desconhecida ou repetida: 400 sem gravar nem reabrir", async () => {
  const mensagem = "Situação inválida: Cancelado e Em digitação nunca contam como venda.";
  const casos: [Record<string, unknown>, number[]][] = [
    [{}, [9, 12]],
    [{}, [9, 21]],
    [{}, [9, 999]],
    [{}, [9, 9]],
    [{ situations: [] }, [9, 21]], // sem situações carregadas valem as padrão
  ];
  for (const [over, ids] of casos) {
    conexao = conectada(over);
    chamadas.length = 0;
    const vista = versaoDe(over.situations === undefined ? SITUACOES_DA_LOJA : []);
    const resposta = await PATCH(ajustar({ sale_situation_ids: ids, situacoes_versao: vista }));
    assert.equal(resposta.status, 400, String(ids));
    assert.deepEqual(await resposta.json(), { error: mensagem });
    assert.deepEqual([gravacoes().length, reaberturas().length], [0, 0], String(ids));
  }
  // Verificado (24) é padrão do Bling: vale quando as situações da conta não carregaram.
  conexao = conectada({ situations: [] });
  assert.equal((await PATCH(ajustar({ sale_situation_ids: [24, 9], situacoes_versao: versaoDe([]) }))).status, 200);
});

test("campanha sem pixel e token, ou que não é da loja: 400 sem gravar", async () => {
  for (const id of [CAMPANHA_SEM_TOKEN, "9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f"]) {
    conexao = conectada();
    chamadas.length = 0;
    const resposta = await PATCH(ajustar({ meta_campaign_id: id }));
    assert.equal(resposta.status, 400, id);
    assert.deepEqual(await resposta.json(), { error: "Escolha uma campanha com o pixel e o token do Meta configurados." });
    assert.equal(gravacoes().length, 0);
    const campanhas = chamadas.find((c) => c.url.pathname === "/rest/v1/campaign_groups");
    assert.equal(campanhas?.url.searchParams.get("tenant_id"), "eq.loja-b");
  }
});

test("ajustes sem conexão ou desconectada: 404 sem gravar", async () => {
  for (const atual of [null, conectada({ status: "desconectada" })]) {
    conexao = atual;
    chamadas.length = 0;
    const resposta = await PATCH(ajustar({ meta_enabled: false }));
    assert.equal(resposta.status, 404);
    assert.deepEqual(await resposta.json(), { error: "Sem conexão com o Bling." });
    assert.equal(gravacoes().length, 0);
  }
});

test("ajustes sem as variáveis: 503 sem tocar no banco; operador e vendedora: 403", async () => {
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  const resposta = await PATCH(ajustar({ meta_enabled: false }));
  assert.equal(resposta.status, 503);
  assert.deepEqual(await resposta.json(), { error: "indisponivel" });
  assert.deepEqual(doBanco(), []);

  Object.assign(process.env, ENV);
  for (const p of ["operator", "seller"]) {
    chamadas.length = 0;
    papel = p;
    assert.equal((await PATCH(ajustar({ meta_enabled: false }))).status, 403, p);
    assert.deepEqual(doBanco(), [], p);
  }
});

test("ajustes com o banco falhando: 500 sem a mensagem do banco", async () => {
  conexao = conectada();
  delete banco["/rest/v1/rpc/bling_recompute_lists"];
  const resposta = await PATCH(ajustar({ high_value: 2000 }));
  assert.equal(resposta.status, 500);
  assert.ok(!(await resposta.text()).includes("inesperado"));
});
