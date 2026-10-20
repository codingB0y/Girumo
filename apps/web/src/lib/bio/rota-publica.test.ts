// apps/web/src/lib/bio/rota-publica.test.ts
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { before, test } from "node:test";

import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";

import type { BuscaPorSlug } from "@/lib/bio/cache";
import { documentoPadrao, type DadosRender } from "@/lib/bio/documento";

/**
 * `responderBio` com cache e banco trocados por funções (`DepsBio`). A visita vai
 * para o `after()`: o escopo falso só guarda a tarefa e o teste a roda quando
 * quer — é assim que se prova que a página não espera o banco.
 */

// O Next lê este global uma vez, quando carrega: antes do import (dinâmico, no `before`).
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

const PAGINA = "3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607";
const NONCE = "bm9uY2UtZG8tdGVzdGUtMTIz"; // base64 de "nonce-do-teste-123": passa no nonceAttribute
const GENTE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

let modulo: typeof import("./rota-publica");
let noEscopo: (fn: () => Promise<Response>) => Promise<Response>;
const depois: (() => Promise<unknown>)[] = [];

before(async () => {
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  const escopo = {
    afterContext: { after: (tarefa: () => Promise<unknown>) => void depois.push(tarefa) },
  } as unknown as WorkStore;
  noEscopo = (fn) => workAsyncStorage.run(escopo, fn);
  modulo = await import("./rota-publica");
});

function dados(): DadosRender {
  return {
    documento: documentoPadrao({ nome: "Ateliê da Ana", campanhaId: null }),
    paginaId: PAGINA,
    campanhas: {},
    linksEscondidos: [],
    origem: "https://www.girumo.com.br",
    dominioProprio: false,
  };
}

type Opcoes = { busca?: BuscaPorSlug | Error; dono?: string | null | Error; loja?: DadosRender | null | Error };

function cenario(o: Opcoes = {}) {
  depois.length = 0;
  const buscados: string[] = [];
  const contados: [string, string][] = [];
  const consultas: string[] = [];
  const busca = o.busca === undefined ? { tipo: "pagina" as const, dados: dados() } : o.busca;
  const deps = {
    porSlug: async (slug: string): Promise<BuscaPorSlug> => {
      buscados.push(slug);
      if (busca instanceof Error) throw busca;
      return busca;
    },
    donoDoHost: async (host: string): Promise<string | null> => {
      consultas.push(`host:${host}`);
      if (o.dono instanceof Error) throw o.dono;
      return o.dono ?? null;
    },
    daLoja: async (tenantId: string, origem: string): Promise<DadosRender | null> => {
      consultas.push(`loja:${tenantId}:${origem}`);
      if (o.loja instanceof Error) throw o.loja;
      return o.loja ?? null;
    },
    contar: async (paginaId: string, alvo: string): Promise<void> => {
      contados.push([paginaId, alvo]);
    },
  };
  return { deps, buscados, contados, consultas };
}

function pedido(caminho: string, i: { metodo?: string; ua?: string | null; ip?: string; host?: string; extra?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = {
    host: i.host ?? "www.girumo.com.br",
    "x-nonce": NONCE,
    "x-forwarded-for": i.ip ?? "203.0.113.10",
    ...i.extra,
  };
  if (i.ua !== null) headers["user-agent"] = i.ua ?? GENTE;
  return new Request(`https://www.girumo.com.br${caminho}`, { method: i.metodo ?? "GET", headers });
}

function responder(req: Request, slug: string, deps: ReturnType<typeof cenario>["deps"]): Promise<Response> {
  return noEscopo(() => modulo.responderBio(req, slug, deps));
}

/** O que o Next faz depois que a resposta sai. */
async function rodarDepois(): Promise<void> {
  for (const tarefa of depois.splice(0)) await tarefa();
}

test("página publicada: 200, HTML com o nonce da request, noindex", async () => {
  const { deps, buscados } = cenario();
  const res = await responder(pedido("/bio/atelie-da-ana"), "atelie-da-ana", deps);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const html = await res.text();
  assert.ok(html.includes(`nonce="${NONCE}"`), "o <style>/<script> perdeu o nonce do middleware");
  assert.ok(html.includes(`data-pagina="${PAGINA}"`));
  assert.deepEqual(buscados, ["atelie-da-ana"]);
});

test("slug antigo: 301 para o atual, no-store, levando a query; não conta visita", async () => {
  const { deps } = cenario({ busca: { tipo: "mudou", slugAtual: "atelie-novo" } });
  const res = await responder(pedido("/bio/atelie-velho?utm_source=ig"), "atelie-velho", deps);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "/bio/atelie-novo?utm_source=ig");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(depois.length, 0);
});

test("inexistente, não publicada ou bloqueada (o cache devolve null): 404 HTML com o nonce", async () => {
  const { deps } = cenario({ busca: null });
  const res = await responder(pedido("/bio/nao-existe"), "nao-existe", deps);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const html = await res.text();
  assert.match(html, /Página não encontrada/);
  assert.ok(html.includes(`nonce="${NONCE}"`));
  assert.equal(depois.length, 0);
});

test("slug atual fora do formato (dado podre no banco) não vira Location: 404", async () => {
  for (const slugAtual of ["//evil.com", "Atelie", "a/../b", "x\r\nset-cookie: a=b"]) {
    const { deps } = cenario({ busca: { tipo: "mudou", slugAtual } });
    const res = await responder(pedido("/bio/atelie-velho"), "atelie-velho", deps);
    assert.equal(res.status, 404, slugAtual);
    assert.equal(res.headers.get("location"), null, slugAtual);
  }
});

test("slug fora do formato nem chega no cache", async () => {
  for (const slug of ["Atelie", "at", "a".repeat(41), "_dominio", "ateliê", "a--b", "-ab", "ab-"]) {
    const { deps, buscados } = cenario();
    const res = await responder(pedido(`/bio/${encodeURIComponent(slug)}`), slug, deps);
    assert.equal(res.status, 404, slug);
    assert.deepEqual(buscados, [], slug);
  }
});

test("visita: GET de gente conta uma vez, depois da resposta", async () => {
  const { deps, contados } = cenario();
  const res = await responder(pedido("/bio/atelie-da-ana", { ip: "203.0.113.21" }), "atelie-da-ana", deps);
  assert.equal(res.status, 200);
  assert.deepEqual(contados, [], "contou antes de responder");
  await rodarDepois();
  assert.deepEqual(contados, [[PAGINA, "visita"]]);
});

test("HEAD, prefetch e robô não contam visita", async () => {
  const casos = [
    pedido("/bio/atelie-da-ana", { metodo: "HEAD" }),
    pedido("/bio/atelie-da-ana", { extra: { "sec-purpose": "prefetch;prerender" } }),
    pedido("/bio/atelie-da-ana", { extra: { purpose: "prefetch" } }),
    pedido("/bio/atelie-da-ana", { ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" }),
    pedido("/bio/atelie-da-ana", { ua: "WhatsApp/2.23.20.0" }),
    pedido("/bio/atelie-da-ana", { ua: null }),
  ];
  for (const req of casos) {
    const { deps, contados } = cenario();
    const res = await responder(req, "atelie-da-ana", deps);
    assert.equal(res.status, 200);
    await rodarDepois();
    assert.deepEqual(contados, [], `${req.method} ${req.headers.get("user-agent")} ${req.headers.get("sec-purpose") ?? req.headers.get("purpose")}`);
  }
});

test("teto por IP e página: a 31ª visita do minuto não conta; outro IP conta", async () => {
  const { deps, contados } = cenario();
  for (let i = 0; i < 31; i++) {
    await responder(pedido("/bio/atelie-da-ana", { ip: "203.0.113.31" }), "atelie-da-ana", deps);
  }
  await responder(pedido("/bio/atelie-da-ana", { ip: "203.0.113.32" }), "atelie-da-ana", deps);
  await rodarDepois();
  assert.equal(contados.length, 31);
});

test("falha ao contar não derruba nada: vai pro log", async (t) => {
  const erros = t.mock.method(console, "error", () => {});
  const { deps } = cenario();
  deps.contar = async () => {
    throw new Error("banco caiu");
  };
  const res = await responder(pedido("/bio/atelie-da-ana", { ip: "203.0.113.40" }), "atelie-da-ana", deps);
  assert.equal(res.status, 200);
  await rodarDepois();
  assert.equal(erros.mock.callCount(), 1);
  assert.match(String(erros.mock.calls[0].arguments[0]), /visita não contada/);
});

test("cache ou banco fora do ar: 503 de texto, sem cache, e o erro no log", async (t) => {
  const erros = t.mock.method(console, "error", () => {});
  const { deps } = cenario({ busca: new Error("banco caiu") });
  const res = await responder(pedido("/bio/atelie-da-ana"), "atelie-da-ana", deps);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(await res.text(), /Tente de novo/);
  assert.equal(erros.mock.callCount(), 1);
});

test("raiz do domínio próprio: a página da loja dona do host, com a origem dele; conta visita", async () => {
  const loja = { ...dados(), origem: "https://links.atelie-da-ana.test", dominioProprio: true };
  const { deps, consultas, contados } = cenario({ dono: "loja-a", loja });
  const res = await responder(pedido("/bio/_dominio", { host: "Links.Atelie-da-Ana.test:443", ip: "203.0.113.50" }), "_dominio", deps);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes(`data-pagina="${PAGINA}"`));
  assert.deepEqual(consultas, ["host:links.atelie-da-ana.test", "loja:loja-a:https://links.atelie-da-ana.test"]);
  await rodarDepois();
  assert.deepEqual(contados, [[PAGINA, "visita"]]);
});

test("_dominio no host do Girumo é 404 HTML, sem consultar nada", async () => {
  for (const host of ["www.girumo.com.br", "app.girumo.com.br", "localhost:3000"]) {
    const { deps, consultas, buscados } = cenario({ dono: "loja-a", loja: dados() });
    const res = await responder(pedido("/bio/_dominio", { host }), "_dominio", deps);
    assert.equal(res.status, 404, host);
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8", host);
    assert.deepEqual([...consultas, ...buscados], [], host);
  }
});

test("domínio sem dono ativo, ou loja sem página: o 404 de texto do middleware", async () => {
  const host = "links.atelie-da-ana.test";
  const casos: [Opcoes, string[]][] = [
    [{ dono: null }, [`host:${host}`]], // sem dono, a loja nem é procurada
    [{ dono: "loja-a", loja: null }, [`host:${host}`, `loja:loja-a:https://${host}`]],
  ];
  for (const [o, esperadas] of casos) {
    const { deps, consultas } = cenario(o);
    const res = await responder(pedido("/bio/_dominio", { host }), "_dominio", deps);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(await res.text(), "Link não encontrado.");
    assert.deepEqual(consultas, esperadas);
  }
});

test("raiz do domínio com o banco fora do ar: 503, sem cache", async (t) => {
  const erros = t.mock.method(console, "error", () => {});
  const casos: Opcoes[] = [{ dono: new Error("banco caiu") }, { dono: "loja-a", loja: new Error("banco caiu") }];
  for (const o of casos) {
    const { deps } = cenario(o);
    const res = await responder(pedido("/bio/_dominio", { host: "links.atelie-da-ana.test" }), "_dominio", deps);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    assert.match(await res.text(), /Tente de novo/);
  }
  assert.equal(erros.mock.callCount(), casos.length);
});
