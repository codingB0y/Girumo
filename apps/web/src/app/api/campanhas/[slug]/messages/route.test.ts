import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { POST } from "./route";

/**
 * O POST de mensagens contra um Supabase de mentira (o PostgREST falso de
 * `api/orders/route.test.ts`). Cobre o que a rota decide ANTES de gravar: o
 * destino (spec postar-por-grupo §6.5). O passo seguinte é o teto do plano, e o
 * banco falso responde 500 nele: chegar lá — status 500, `GET /subscriptions`
 * feito e nenhum `POST /broadcasts` — prova que o destino passou sem gravar nada.
 */

const CAMPANHA_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const G1 = "120363001@g.us";
const G2 = "120363002@g.us";
const G3 = "120363003@g.us";
const COMUNIDADE = "120363777@g.us";
const AVISOS = "120363099@g.us";
const RPC = "/rest/v1/rpc/campaign_group_states";

type Chamada = { metodo: string; url: URL; corpo: unknown };
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

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
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

/** Dono logado por Bearer na `loja-b`; o teto do plano para a rota; o resto vem de `tabelas`. */
function banco(tabelas: Record<string, () => Resposta>): (chamada: Chamada) => Resposta {
  return ({ metodo, url }) => {
    if (url.pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
    if (url.pathname === "/rest/v1/memberships") return { status: 200, corpo: [{ tenant_id: "loja-b", role: "owner" }] };
    if (url.pathname === "/rest/v1/subscriptions") return { status: 500, corpo: { message: "parou no teto" } };
    const tabela = tabelas[`${metodo} ${url.pathname}`];
    return tabela ? tabela() : { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
  };
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
