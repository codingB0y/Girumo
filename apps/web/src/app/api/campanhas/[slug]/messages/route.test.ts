import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { POST as RotaPost } from "./route";

/**
 * O POST de mensagens contra um Supabase de mentira (o PostgREST falso de
 * `api/orders/route.test.ts`). Cobre o que a rota decide ANTES de gravar: o
 * destino (spec postar-por-grupo §6.5). O passo seguinte é o teto do plano, e o
 * banco falso responde 500 nele: chegar lá — status 500, `GET /subscriptions`
 * feito e nenhum `POST /broadcasts` — prova que o destino passou sem gravar nada.
 * Os testes de "grava" liberam o plano e o número e leem o corpo do INSERT em
 * `broadcasts`: é ele que o worker lê para decidir os grupos.
 */

const CAMPANHA_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const G1 = "120363001@g.us";
const G2 = "120363002@g.us";
const G3 = "120363003@g.us";
const COMUNIDADE = "120363777@g.us";
const AVISOS = "120363099@g.us";
const RPC = "/rest/v1/rpc/campaign_group_states";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Tabela = (chamada: Chamada) => Resposta;
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500 });

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

let POST: typeof RotaPost;

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";

  // `cookies()` do Next só existe dentro de um request do Next, e a rota o lê (cookie
  // legado) antes de gravar. O login aqui é por Bearer, então a jarra é vazia. Precisa
  // valer ANTES de a rota carregar: por isso o import dinâmico, e não o do topo.
  const headersDoNext = createRequire(import.meta.url)("next/headers") as { cookies: () => Promise<unknown> };
  headersDoNext.cookies = async () => ({ get: () => undefined });
  ({ POST } = await import("./route"));
});

after(() => {
  supabase.close();
});

function campanha(over: Record<string, unknown> = {}) {
  return {
    id: CAMPANHA_ID,
    tenant_id: "loja-b",
    name: "Moda Kids do Sul",
    slug: "moda-kids",
    group_ids: [G1, G2, G3],
    auto_grow: false,
    grow_template: null,
    metadata: {},
    whatsapp_community_jid: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

/** Linha de `campaign_group_states` como o banco devolve (snake_case, contrato §1). */
function estado(posicao: number, jid: string, estadoDoGrupo: string, menosEnchendo: boolean) {
  return {
    posicao,
    group_id: `00000000-0000-4000-8000-00000000000${posicao}`,
    whatsapp_group_id: jid,
    name: `Moda Kids do Sul ${posicao}`,
    members: 500,
    capacity: 1024,
    is_admin: true,
    invite_url: "https://chat.whatsapp.com/x",
    lotado_em: null,
    lotado_por: null,
    reaberto_em: null,
    aviso_lotou_em: null,
    estado: estadoDoGrupo,
    pode_reabrir: false,
    na_regra_menos_enchendo: menosEnchendo,
    na_regra_lotados: false,
    na_regra_com_gente: estadoDoGrupo !== "vazio",
  };
}

type Quem = { papel: "owner" | "seller"; modulos: string[]; liberado: boolean };

/**
 * Usuário logado por Bearer na `loja-b` (dono, por padrão); o resto vem de `tabelas`.
 * O teto do plano responde 500 ("parou no teto") — a não ser que `liberado`: aí o
 * plano não tem teto, e quem chama monta também `instances` e o INSERT (ver `gravando`).
 */
function banco(tabelas: Record<string, Tabela>, quem: Partial<Quem> = {}): (chamada: Chamada) => Resposta {
  const { papel = "owner", modulos = [], liberado = false } = quem;
  return (chamada) => {
    const { metodo, url } = chamada;
    if (url.pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
    if (url.pathname === "/rest/v1/memberships") {
      return { status: 200, corpo: [{ tenant_id: "loja-b", role: papel, modules: modulos }] };
    }
    if (url.pathname === "/rest/v1/subscriptions") {
      return liberado
        ? { status: 200, corpo: [{ status: "active", metadata: {}, current_period_end: null, plans: { limits: {} } }] }
        : { status: 500, corpo: { message: "parou no teto" } };
    }
    const tabela = tabelas[`${metodo} ${url.pathname}`];
    return tabela ? tabela(chamada) : { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
  };
}

/** Plano liberado, número conectado e o INSERT/enfileirar do disparo respondendo: a rota grava. */
function gravando(tabelas: Record<string, Tabela>): (chamada: Chamada) => Resposta {
  const agora = new Date().toISOString();
  return banco(
    {
      "GET /rest/v1/instances": () => ({
        status: 200,
        corpo: [
          { id: "inst-1", phone: "5511999990000", status: "connected", connected_at: agora, last_seen_at: agora, metadata: {}, updated_at: agora },
        ],
      }),
      // O que o PostgREST devolve do INSERT: a linha gravada, com os defaults do banco.
      "POST /rest/v1/broadcasts": ({ corpo }) => ({
        status: 201,
        corpo: {
          ...(corpo as object),
          id: "bc-1",
          run_id: null,
          error: null,
          dispatched_at: null,
          running_since: null,
          last_ack_at: null,
          created_at: agora,
          updated_at: agora,
        },
      }),
      "POST /rest/v1/rpc/enqueue_broadcast": () => ({ status: 200, corpo: null }),
      "POST /rest/v1/funnel_events": () => ({ status: 201 }),
      ...tabelas,
    },
    { liberado: true },
  );
}

function postar(corpo: unknown): Promise<Response> {
  return POST(
    new Request("http://girumo.test/api/campanhas/moda-kids/messages", {
      method: "POST",
      headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
    { params: Promise.resolve({ slug: "moda-kids" }) },
  );
}

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

/**
 * `first_dispatch` sai sem esperar (`void trackFunnelEvent`). Esperar o pedido chegar evita
 * que ele vaze para o teste seguinte, ou bata no servidor já fechado.
 */
async function aguardarMarcoDeAtivacao() {
  for (let i = 0; i < 100 && feitas("POST", "/rest/v1/funnel_events").length === 0; i++) {
    await new Promise((pronto) => setTimeout(pronto, 10));
  }
}

/** O destino passou: a rota foi até o teto do plano e não gravou disparo. */
function chegouAoTeto(res: Response) {
  assert.equal(res.status, 500);
  assert.equal(feitas("GET", "/rest/v1/subscriptions").length, 1);
  assert.equal(feitas("POST", "/rest/v1/broadcasts").length, 0);
}

test("lista fixa com grupo de fora da campanha: 400, sem teto e sem gravar", async () => {
  chamadas.length = 0;
  responder = banco({ "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }) });

  // Mutante: a rota de antes, que usava `body.groupIds` sem conferir nada.
  const res = await postar({ body: "oferta", groupIds: [G1, "120363999@g.us"] });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    error: "Um dos grupos escolhidos não está nesta campanha. Recarregue a página e escolha de novo.",
  });
  assert.equal(feitas("GET", "/rest/v1/subscriptions").length, 0);
  assert.equal(feitas("POST", "/rest/v1/broadcasts").length, 0);
  // Campanha comum não paga a consulta do Avisos.
  assert.equal(feitas("GET", "/rest/v1/groups").length, 0);
  const [busca] = feitas("GET", "/rest/v1/campaign_groups");
  assert.equal(busca.url.searchParams.get("tenant_id"), "eq.loja-b");
});

test("regra fora do contrato: 400", async () => {
  chamadas.length = 0;
  responder = banco({ "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }) });

  const res = await postar({ body: "oferta", destino: { regra: "todos" } });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Regra de destino inválida." });
  assert.equal(feitas("POST", RPC).length, 0);
});

test("enviar agora sem destino: lê o estado na hora e recusa quando a regra padrão está vazia", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }),
    // Só o grupo que está enchendo e um vazio: "todos menos o que está enchendo" dá zero.
    [`POST ${RPC}`]: () => ({ status: 200, corpo: [estado(1, G1, "enchendo", false), estado(2, G2, "vazio", false)] }),
  });

  // Mutante: padrão "com_gente" (ou o "todos" de antes) mandaria para o G1, que está enchendo.
  const res = await postar({ body: "oferta" });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Nenhum grupo nesta regra agora." });
  // O estado é lido NESTE envio, da campanha e do tenant da rota — nunca o que a tela viu ao abrir.
  const [rpc] = feitas("POST", RPC);
  assert.deepEqual(rpc.corpo, { p_tenant: "loja-b", p_campaign: CAMPANHA_ID });
  assert.equal(feitas("GET", "/rest/v1/subscriptions").length, 0);
});

test("regra com grupo agora segue para o teto do plano (o destino não pula o gate)", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }),
    [`POST ${RPC}`]: () => ({ status: 200, corpo: [estado(1, G1, "enchendo", false), estado(2, G2, "fila", true)] }),
  });

  chegouAoTeto(await postar({ body: "oferta", destino: { regra: "menos_enchendo" } }));
  assert.equal(feitas("POST", RPC).length, 1);
});

test("agendado com regra não consulta o estado agora: até a hora, algum grupo pode lotar", async () => {
  chamadas.length = 0;
  responder = banco({ "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }) });
  const amanha = new Date(Date.now() + 86_400_000).toISOString();

  chegouAoTeto(await postar({ body: "oferta", destino: { regra: "lotados" }, scheduledAt: amanha }));
  assert.equal(feitas("POST", RPC).length, 0);
});

test("comunidade nativa: o Avisos passa como lista fixa mesmo fora de group_ids", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha({ whatsapp_community_jid: COMUNIDADE })] }),
    "GET /rest/v1/groups": () => ({
      status: 200,
      corpo: [{ community_jid: COMUNIDADE, whatsapp_group_id: AVISOS, members: 3000, is_admin: true }],
    }),
  });

  // Mutante: conferir só `group_ids` quebraria o "Enviar pelo Avisos" da aba.
  chegouAoTeto(await postar({ body: "aviso", destino: { grupos: [AVISOS] } }));
  const [avisos] = feitas("GET", "/rest/v1/groups");
  assert.equal(avisos.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(avisos.url.searchParams.get("community_role"), "eq.announce");
});

test("comunidade nativa: o groupIds legado também pede o Avisos, e ele passa", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha({ whatsapp_community_jid: COMUNIDADE })] }),
    "GET /rest/v1/groups": () => ({
      status: 200,
      corpo: [{ community_jid: COMUNIDADE, whatsapp_group_id: AVISOS, members: 3000, is_admin: true }],
    }),
  });

  // Mutante: pular a consulta quando não há `destino` — o `groupIds` ainda é lista fixa.
  chegouAoTeto(await postar({ body: "aviso", groupIds: [AVISOS] }));
  assert.equal(feitas("GET", "/rest/v1/groups").length, 1);
});

test("comunidade nativa: regra (ou nenhum destino) não consulta o Avisos e segue para gravar", async () => {
  // Sem handler de `groups`: se a rota consultasse, o banco falso responderia 500.
  // Mutante: consultar o Avisos em todo POST — o padrão de toda tela é uma regra.
  for (const corpo of [{ body: "oferta" }, { body: "oferta", destino: { regra: "menos_enchendo" } }]) {
    chamadas.length = 0;
    responder = gravando({
      "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha({ whatsapp_community_jid: COMUNIDADE })] }),
      [`POST ${RPC}`]: () => ({ status: 200, corpo: [estado(1, G1, "enchendo", false), estado(2, G2, "fila", true)] }),
    });

    const res = await postar(corpo);

    assert.equal(res.status, 201, JSON.stringify(corpo));
    assert.equal(feitas("GET", "/rest/v1/groups").length, 0, JSON.stringify(corpo));
    assert.equal(feitas("POST", "/rest/v1/broadcasts").length, 1, JSON.stringify(corpo));
    await aguardarMarcoDeAtivacao();
  }
});

test("vendedora não tem o Avisos: destino.grupos não fura o que groupIds já recusava", async () => {
  chamadas.length = 0;
  responder = banco(
    { "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha({ whatsapp_community_jid: COMUNIDADE })] }) },
    { papel: "seller", modulos: ["postar"] },
  );

  // Mutante: extras do Avisos para todo papel. `groupIds` está limpo (passa o bloco da
  // vendedora) e `destino` vence `groupIds`: sem o corte, o Avisos passava e gravava.
  const res = await postar({ body: "aviso", groupIds: [G1], destino: { grupos: [AVISOS] } });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    error: "Um dos grupos escolhidos não está nesta campanha. Recarregue a página e escolha de novo.",
  });
  assert.equal(feitas("GET", "/rest/v1/subscriptions").length, 0);
  assert.equal(feitas("POST", "/rest/v1/broadcasts").length, 0);
});

test("vendedora posta por regra normalmente: cortar o Avisos não a barra do resto", async () => {
  chamadas.length = 0;
  responder = banco(
    {
      "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha({ whatsapp_community_jid: COMUNIDADE })] }),
      [`POST ${RPC}`]: () => ({ status: 200, corpo: [estado(1, G1, "enchendo", false), estado(2, G2, "fila", true)] }),
    },
    { papel: "seller", modulos: ["postar"] },
  );

  chegouAoTeto(await postar({ body: "oferta", destino: { regra: "menos_enchendo" } }));
});

test("regra (e o padrão sem destino) grava group_ids vazio e a regra: o banco refaz os grupos no envio", async () => {
  chamadas.length = 0;
  responder = gravando({
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }),
    [`POST ${RPC}`]: () => ({ status: 200, corpo: [estado(1, G1, "enchendo", false), estado(2, G2, "fila", true)] }),
  });

  // Mutante: `target_rule: null` — sem a regra e com `group_ids` vazio, o predicado antigo
  // do banco mandava o post para TODOS os grupos admin.
  const res = await postar({ body: "oferta" });

  assert.equal(res.status, 201);
  const [insert] = feitas("POST", "/rest/v1/broadcasts");
  assert.deepEqual(insert.corpo, {
    tenant_id: "loja-b",
    campaign_group_id: CAMPANHA_ID,
    name: "Moda Kids do Sul",
    message: "oferta",
    group_ids: [],
    media_id: null,
    media_type: null,
    media_name: null,
    mention_all: false,
    poll: null,
    status: "draft",
    sent: 0,
    total: 0,
    funnel_template_id: null,
    funnel_run_id: null,
    target_rule: "menos_enchendo",
  });
  assert.equal(feitas("POST", "/rest/v1/rpc/enqueue_broadcast").length, 1);
  await aguardarMarcoDeAtivacao();
});

test("uma regra que não é a padrão chega ao disparo: target_rule é a escolhida, group_ids vazio", async () => {
  chamadas.length = 0;
  responder = gravando({
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }),
    // O G1 está enchendo: só "com_gente" o inclui (menos_enchendo = false), então a regra lida importa.
    [`POST ${RPC}`]: () => ({ status: 200, corpo: [estado(1, G1, "enchendo", false)] }),
  });

  // Mutante: gravar sempre a regra padrão, ignorando a que a tela escolheu.
  const res = await postar({ body: "oferta", destino: { regra: "com_gente" } });

  assert.equal(res.status, 201);
  const [insert] = feitas("POST", "/rest/v1/broadcasts");
  const corpo = insert.corpo as Record<string, unknown>;
  assert.equal(corpo.target_rule, "com_gente");
  assert.deepEqual(corpo.group_ids, []);
  await aguardarMarcoDeAtivacao();
});

test("lista fixa grava exatamente os grupos escolhidos e nenhuma regra", async () => {
  chamadas.length = 0;
  responder = gravando({ "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }) });

  // Mutante: gravar a regra junto da lista, ou perder a lista. O banco preferiria a regra.
  const res = await postar({ body: "oferta", destino: { grupos: [G3, G1] } });

  assert.equal(res.status, 201);
  const [insert] = feitas("POST", "/rest/v1/broadcasts");
  const corpo = insert.corpo as Record<string, unknown>;
  assert.deepEqual(corpo.group_ids, [G3, G1]);
  assert.equal(corpo.total, 2);
  assert.equal("target_rule" in corpo, false);
  // Lista fixa não lê o estado dos grupos.
  assert.equal(feitas("POST", RPC).length, 0);
  await aguardarMarcoDeAtivacao();
});

test("post que o banco devolve failed (todos no limite do dia) responde 422 com o motivo e não marca ativação", async () => {
  chamadas.length = 0;
  const motivo = "Nenhum grupo recebeu: todos já tinham 4 posts hoje. O limite volta à meia-noite.";
  responder = gravando({
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [campanha()] }),
    [`POST ${RPC}`]: () => ({ status: 200, corpo: [estado(1, G1, "fila", true)] }),
    "POST /rest/v1/rpc/enqueue_broadcast": () => ({
      status: 200,
      corpo: { id: "bc-1", status: "failed", error: motivo, sent: 0, total: 1 },
    }),
  });

  const res = await postar({ body: "oferta" });

  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: motivo });
  assert.equal(feitas("POST", "/rest/v1/funnel_events").length, 0);
});
