import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test, type TestContext } from "node:test";

import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";

import type { EstadoRow } from "@/lib/groups/estado";

/**
 * O clique em `/r/<slug>` inteiro contra um PostgREST de mentira: link, campanha e
 * estados saem como em produção, só a rede é trocada. Prova o que o PR 2 muda — o
 * alvo vem do `enchendo` da RPC, com a loja tirada da linha do link (o clique não
 * traz loja nenhuma).
 *
 * A gravação do clique vai para o `after()`: o escopo falso só guarda a tarefa, e o
 * teste a roda quando quer — é assim que se prova que o redirect não espera o banco.
 */

// O Next lê este global uma vez, quando carrega: antes do import (dinâmico, no `before`).
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

let modulo: typeof import("./short-link-click");
let noEscopo: (handler: () => Promise<Response>) => Promise<Response>;
const tarefasDepois: (() => Promise<unknown>)[] = [];

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let estados: EstadoRow[] = [];
/** O que o `site_captures` falso devolve: [{id}] = cadastro da loja, [] = não é desta loja. */
let cadastros: { id: string }[] = [];
/** Rotas do banco que respondem 500 neste teste ("GET /rest/v1/tracked_links"). */
let foraDoAr = new Set<string>();

const LINK = {
  id: "link-1",
  tenant_id: "loja-a",
  campaign_group_id: "camp-1",
  slug: "moda-kids",
  target_url: "",
  clicks: 0,
  metadata: {},
  created_at: "2026-10-01T00:00:00+00:00",
  updated_at: "2026-10-01T00:00:00+00:00",
};

const CAMPANHA = {
  id: "camp-1",
  tenant_id: "loja-a",
  name: "Moda Kids",
  slug: "moda-kids",
  group_ids: ["g1@g.us", "g2@g.us"],
  auto_grow: false,
  grow_template: null,
  metadata: {} as Record<string, unknown>,
  whatsapp_community_jid: null,
  created_at: "2026-10-01T00:00:00+00:00",
  updated_at: "2026-10-01T00:00:00+00:00",
};

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const respostas: Record<string, Resposta> = {
      "GET /rest/v1/tracked_links": { status: 200, corpo: [LINK] },
      "GET /rest/v1/campaign_groups": { status: 200, corpo: [CAMPANHA] },
      "POST /rest/v1/rpc/campaign_group_states": { status: 200, corpo: estados },
      "POST /rest/v1/rpc/increment_tracked_link_clicks": { status: 204 },
      "POST /rest/v1/link_click_events": { status: 201 },
      "GET /rest/v1/site_captures": { status: 200, corpo: cadastros },
    };
    const rota = `${chamada.metodo} ${chamada.url.pathname}`;
    // Chamada que ninguém previu vira 500, para aparecer.
    const { status, corpo } = foraDoAr.has(rota)
      ? { status: 500, corpo: { code: "XX000", message: "banco fora do ar", details: null, hint: null } }
      : (respostas[rota] ?? { status: 500, corpo: { message: `inesperado: ${rota}` } });
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  const escopo = {
    afterContext: { after: (tarefa: () => Promise<unknown>) => void tarefasDepois.push(tarefa) },
  } as unknown as WorkStore;
  noEscopo = (handler) => workAsyncStorage.run(escopo, handler);
  modulo = await import("./short-link-click");
});

after(() => {
  postgrest.close();
});

const linha = (over: Partial<EstadoRow> & Pick<EstadoRow, "posicao" | "whatsapp_group_id" | "estado">): EstadoRow => ({
  group_id: `id-${over.posicao}`,
  name: `Moda Kids ${over.posicao}`,
  members: 300,
  capacity: 1024,
  is_admin: true,
  invite_url: `https://chat.whatsapp.com/CONVITE${over.posicao}`,
  lotado_em: null,
  lotado_por: null,
  reaberto_em: null,
  aviso_lotou_em: null,
  pode_reabrir: false,
  na_regra_menos_enchendo: false,
  na_regra_lotados: false,
  na_regra_com_gente: false,
  ...over,
});

/** O clique como a rota o faz: dentro do escopo da requisição. */
function handleShortLinkClick(req: Request, slug: string): Promise<Response> {
  return noEscopo(() => modulo.handleShortLinkClick(req, slug));
}

/** O que o Next faz depois que a resposta sai. */
async function rodarDepois(): Promise<void> {
  for (const tarefa of tarefasDepois.splice(0)) await tarefa();
}

function novoTeste(): void {
  chamadas.length = 0;
  tarefasDepois.length = 0;
  foraDoAr = new Set();
}

const gravacoes = () =>
  chamadas.filter((c) => ["/rest/v1/rpc/increment_tracked_link_clicks", "/rest/v1/link_click_events"].includes(c.url.pathname));

/** Clique de gente no host do Girumo, de um desktop: sem deep link nem tela de entrada. */
function clique(): Request {
  return new Request("https://www.girumo.com.br/r/moda-kids", {
    headers: {
      host: "www.girumo.com.br",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36",
    },
  });
}

test("o clique vai para o grupo que o banco marcou como enchendo, pulando o lotado com vaga", async () => {
  novoTeste();
  estados = [
    // Lotado à mão com 300 de 1024: a regra antiga (95%) mandaria gente para cá.
    linha({ posicao: 1, whatsapp_group_id: "g1@g.us", estado: "lotado", lotado_em: "2026-10-09T12:00:00+00:00", lotado_por: "manual" }),
    linha({ posicao: 2, whatsapp_group_id: "g2@g.us", estado: "enchendo", members: 600 }),
  ];

  const res = await handleShortLinkClick(clique(), "moda-kids");

  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://chat.whatsapp.com/CONVITE2");
  const rpcs = chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/campaign_group_states");
  assert.equal(rpcs.length, 1);
  // Mutante: tenant de outro lugar que não a linha do link (service-role passa por cima do RLS).
  assert.deepEqual(rpcs[0].corpo, { p_tenant: "loja-a", p_campaign: "camp-1" });
  // A listagem da loja inteira (paginada, sem estado) saiu do caminho do clique.
  assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/groups").length, 0);
});

test("sem grupo enchendo (todos lotados), mostra 'todos cheios' em vez de mandar para um lotado", async () => {
  novoTeste();
  estados = [
    linha({ posicao: 1, whatsapp_group_id: "g1@g.us", estado: "lotado", lotado_em: "2026-10-09T12:00:00+00:00", lotado_por: "manual" }),
    linha({ posicao: 2, whatsapp_group_id: "g2@g.us", estado: "lotado", members: 990, lotado_em: "2026-10-08T12:00:00+00:00", lotado_por: "auto" }),
  ];

  const res = await handleShortLinkClick(clique(), "moda-kids");

  assert.equal(res.status, 200);
  assert.match(await res.text(), /Todos os grupos desta campanha estão cheios/);
});

const CID = "0b6f3c1e-8f5a-4d6e-9a2b-3c4d5e6f7a8b";

function cliqueComCid(cid: string): Request {
  const req = clique();
  return new Request(`https://www.girumo.com.br/r/moda-kids?cid=${cid}`, { headers: req.headers });
}

const estadosEnchendo = (): EstadoRow[] => [
  linha({ posicao: 1, whatsapp_group_id: "g1@g.us", estado: "lotado", lotado_em: "2026-10-09T12:00:00+00:00", lotado_por: "manual" }),
  linha({ posicao: 2, whatsapp_group_id: "g2@g.us", estado: "enchendo", members: 600 }),
];

test("?cid= de cadastro da loja: o evento do clique leva o cadastro e o grupo escolhido", async () => {
  novoTeste();
  estados = estadosEnchendo();
  cadastros = [{ id: CID }];

  const res = await handleShortLinkClick(cliqueComCid(CID), "moda-kids");
  await rodarDepois();

  assert.equal(res.status, 302);
  // Mutante: conferir o cadastro sem filtrar pela loja do link deixaria a loja B apontar para a A.
  const conferencias = chamadas.filter((c) => c.url.pathname === "/rest/v1/site_captures");
  assert.equal(conferencias.length, 1);
  assert.equal(conferencias[0].url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(conferencias[0].url.searchParams.get("id"), `eq.${CID}`);
  const evento = chamadas.find((c) => c.url.pathname === "/rest/v1/link_click_events");
  assert.ok(evento);
  const corpo = evento.corpo as { capture_id: string | null; whatsapp_group_id: string | null };
  assert.equal(corpo.capture_id, CID);
  assert.equal(corpo.whatsapp_group_id, "g2@g.us");
});

test("?cid= que não é cadastro desta loja: clique gravado sem cid e o redirect segue normal", async () => {
  novoTeste();
  estados = estadosEnchendo();
  cadastros = [];

  const res = await handleShortLinkClick(cliqueComCid(CID), "moda-kids");
  await rodarDepois();

  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://chat.whatsapp.com/CONVITE2");
  const evento = chamadas.find((c) => c.url.pathname === "/rest/v1/link_click_events");
  assert.ok(evento);
  const corpo = evento.corpo as { capture_id: string | null; whatsapp_group_id: string | null };
  assert.equal(corpo.capture_id, null);
  assert.equal(corpo.whatsapp_group_id, "g2@g.us");
});

test("o redirect sai antes de gravar o clique: o banco só é escrito depois da resposta", async () => {
  novoTeste();
  estados = estadosEnchendo();

  const res = await handleShortLinkClick(clique(), "moda-kids");

  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://chat.whatsapp.com/CONVITE2");
  // Mutante: voltar ao `await` antes da resposta faz o visitante esperar as duas escritas.
  assert.equal(gravacoes().length, 0);

  await rodarDepois();
  assert.equal(gravacoes().length, 2);
});

test("falha ao gravar o clique: o visitante entra no grupo e a falha vai para o log", async (t) => {
  novoTeste();
  estados = estadosEnchendo();
  foraDoAr = new Set(["POST /rest/v1/link_click_events", "POST /rest/v1/rpc/increment_tracked_link_clicks"]);
  const erro = t.mock.method(console, "error", () => {});

  const res = await handleShortLinkClick(clique(), "moda-kids");
  await rodarDepois();

  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://chat.whatsapp.com/CONVITE2");
  // Uma linha por gravação perdida: antes, as duas sumiam sem rastro.
  const logs = erro.mock.calls.map((c) => String(c.arguments[0]));
  assert.equal(logs.filter((l) => l.includes("moda-kids") && l.includes("clique não gravado")).length, 2);
});

test("banco fora no lookup do link: página amigável 503 em vez do 500 vazio do Next", async (t) => {
  novoTeste();
  foraDoAr = new Set(["GET /rest/v1/tracked_links"]);
  const erro = t.mock.method(console, "error", () => {});

  const res = await handleShortLinkClick(clique(), "moda-kids");

  assert.equal(res.status, 503);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await res.text(), /Não conseguimos abrir agora/);
  assert.ok(erro.mock.calls.some((c) => String(c.arguments[0]).includes("moda-kids")));
});

test("banco fora nos grupos da campanha: mesma página amigável, sem gravar clique", async (t) => {
  novoTeste();
  estados = estadosEnchendo();
  foraDoAr = new Set(["POST /rest/v1/rpc/campaign_group_states"]);
  t.mock.method(console, "error", () => {});

  const res = await handleShortLinkClick(clique(), "moda-kids");

  assert.equal(res.status, 503);
  assert.match(await res.text(), /Não conseguimos abrir agora/);
  assert.equal(tarefasDepois.length, 0);
  assert.equal(gravacoes().length, 0);
});

/** Pixel e token da campanha: os mesmos que levam as vendas do Bling ao Meta. */
const META = { pixel_id: "2570456993268181", evento: "Lead", capi_token: `EAAV${"x".repeat(200)}`, test_code: "" };

/**
 * A campanha com estas integrações durante o teste, e o `fetch` da Graph API contado aqui (nada sai
 * da máquina); o PostgREST falso segue recebendo o resto.
 */
function comMeta(t: TestContext, meta: Record<string, unknown>): string[] {
  const antes = CAMPANHA.metadata;
  CAMPANHA.metadata = { settings: { integracoes: { meta } } };
  t.after(() => {
    CAMPANHA.metadata = antes;
  });
  const paraMeta: string[] = [];
  const original = globalThis.fetch;
  t.mock.method(globalThis, "fetch", (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    if (!url.startsWith("https://graph.facebook.com/")) return original(entrada, init);
    paraMeta.push(url);
    return Promise.resolve(Response.json({ events_received: 1 }));
  });
  return paraMeta;
}

/** Com o IP de quem clicou: sem ele o envio nem é tentado (a Meta recusaria), e o teste não veria nada. */
function cliqueComIp(): Request {
  const req = clique();
  const headers = new Headers(req.headers);
  headers.set("x-forwarded-for", "203.0.113.7");
  return new Request(req.url, { headers });
}

test("campanha que dispara no link (o padrão): tela de entrada com o pixel e o evento pelo servidor", async (t) => {
  novoTeste();
  estados = estadosEnchendo();
  const paraMeta = comMeta(t, META);

  const res = await handleShortLinkClick(cliqueComIp(), "moda-kids");
  await rodarDepois();

  assert.equal(res.status, 200);
  assert.match(await res.text(), /fbq\('track',"Lead"/);
  assert.equal(paraMeta.length, 1);
});

test("campanha com o pixel só para as vendas (não dispara no link): direto para o grupo, sem pixel nem evento", async (t) => {
  novoTeste();
  estados = estadosEnchendo();
  const paraMeta = comMeta(t, { ...META, enviar_no_link: false });

  const res = await handleShortLinkClick(cliqueComIp(), "moda-kids");
  await rodarDepois();

  // O site da loja já mandou o Lead desta pessoa: outro, pelo link, contaria a mesma pessoa duas vezes.
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://chat.whatsapp.com/CONVITE2");
  assert.deepEqual(paraMeta, []);
});
