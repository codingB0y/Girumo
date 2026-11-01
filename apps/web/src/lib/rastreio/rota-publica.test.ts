import assert from "node:assert/strict";
import { test } from "node:test";

import { docHmac } from "@/lib/rastreio/documento";
import type { LojaDoRastreio } from "@/lib/rastreio/loja";
import { MUITAS_TENTATIVAS, NAO_ENCONTRADO, PEDIDO_NAO_ENCONTRADO } from "@/lib/rastreio/pagina";
import { responderBusca, responderPedido, type DepsRastreio } from "@/lib/rastreio/rota-publica";
import { MATRIZ_PADRAO, type PedidoPublico, type RastreioConfig } from "@/lib/rastreio/tipos";

const LOJA: LojaDoRastreio = {
  tenantId: "loja-a",
  nome: "Loja Exemplo",
  publicSlug: "loja-exemplo",
  dominio: null,
  corPrimaria: null,
  storeWhatsapp: null,
  vipLinkId: null,
};
const CONFIG: RastreioConfig = {
  tenantId: "loja-a",
  publicSlug: "loja-exemplo",
  matrix: MATRIZ_PADRAO,
  notifyStoreOnProblem: true,
  vipLinkId: null,
  storeWhatsapp: null,
  importedAt: null,
  sweepCursor: null,
};
const TOKEN = "0123456789abcdef0123456789abcdef";
const PEPPER = "p".repeat(32);
const AGORA = new Date("2026-10-29T15:00:00Z");
const NONCE = "bm9uY2UtZG8tdGVzdGUtMTIz";

// CPF e CNPJ inventados, com o dígito calculado aqui (repo público).
const dv = (s: string, pesos: number[]) => {
  const r = [...s].reduce((t, c, i) => t + Number(c) * pesos[i], 0) % 11;
  return String(r < 2 ? 0 : 11 - r);
};
const pesos = (n: number) => Array.from({ length: n }, (_, i) => n + 1 - i);
const cpfCom = (b: string) => {
  const d = dv(b, pesos(9));
  return b + d + dv(b + d, pesos(10));
}; // "111444777" → "11144477735"
const cnpjCom = (b: string) => {
  const p = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d = dv(b, p);
  return b + d + dv(b + d, [6, ...p]);
}; // "112223330001" → "11222333000181"
const CPF = cpfCom("111444777");
const CNPJ = cnpjCom("112223330001");
const CPF_DIGITADO = `${CPF.slice(0, 3)}.${CPF.slice(3, 6)}.${CPF.slice(6, 9)}-${CPF.slice(9)}`;
const CNPJ_DIGITADO = `${CNPJ.slice(0, 2)}.${CNPJ.slice(2, 5)}.${CNPJ.slice(5, 8)}/${CNPJ.slice(8, 12)}-${CNPJ.slice(12)}`;

function achado(numero: string, linkToken: string): PedidoPublico {
  return {
    id: `id-${numero}`,
    numero,
    orderCreatedAt: "2026-10-18T17:32:00Z",
    etapa: "enviado",
    etapaAt: "2026-10-21T02:00:00Z",
    events: [{ etapa: "enviado", at: "2026-10-21T02:00:00Z" }],
    shipmentService: null,
    trackingCode: "AB123456789BR",
    trackingUrl: null,
    linkToken,
    noticesStoppedAt: null,
  };
}

type Opcoes = {
  config?: RastreioConfig | null | Error;
  loja?: LojaDoRastreio | null | Error;
  achados?: PedidoPublico[];
  porToken?: PedidoPublico | null;
  limitar?: DepsRastreio["limitar"];
  pepper?: string | Error;
};

function valor<T>(v: T | Error): T {
  if (v instanceof Error) throw v;
  return v;
}

function cenario(o: Opcoes = {}) {
  const chamadas: string[] = [];
  const buscas: [string, string, string, Date][] = [];
  const deps: DepsRastreio = {
    lojaPorSlug: async (slug) => {
      chamadas.push(`slug:${slug}`);
      return valor(o.config === undefined ? CONFIG : o.config);
    },
    loja: async (tenantId) => {
      chamadas.push(`loja:${tenantId}`);
      return valor(o.loja === undefined ? LOJA : o.loja);
    },
    buscar: async (tenantId, hmac, last4, desde) => {
      buscas.push([tenantId, hmac, last4, desde]);
      return o.achados ?? [];
    },
    porToken: async (tenantId, token) => {
      chamadas.push(`token:${tenantId}:${token}`);
      return o.porToken === undefined ? achado("1001", TOKEN) : o.porToken;
    },
    pepper: () => valor(o.pepper ?? PEPPER),
    limitar: o.limitar ?? (async () => false),
    agora: () => AGORA,
  };
  return { deps, chamadas, buscas };
}

function pedido(caminho: string, op: { metodo?: string; host?: string; ip?: string; extra?: RequestInit } = {}): Request {
  return new Request(`https://www.girumo.com.br${caminho}`, {
    method: op.metodo ?? "GET",
    headers: { host: op.host ?? "www.girumo.com.br", "x-nonce": NONCE, "x-forwarded-for": op.ip ?? "203.0.113.10" },
    ...op.extra,
  });
}

function postar(campos: Record<string, string>, op: { ip?: string } = {}): Request {
  return new Request("https://www.girumo.com.br/rastreio/loja-exemplo", {
    method: "POST",
    headers: {
      host: "www.girumo.com.br",
      "x-nonce": NONCE,
      "x-forwarded-for": op.ip ?? "203.0.113.10",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(campos).toString(),
  });
}

function cabecalhosHtml(res: Response) {
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
}

test("GET mostra a busca da loja do slug, com noindex e no-store", async () => {
  const { deps, chamadas } = cenario();
  const res = await responderBusca(pedido("/rastreio/loja-exemplo"), "loja-exemplo", deps);
  assert.equal(res.status, 200);
  cabecalhosHtml(res);
  assert.ok((await res.text()).includes('action="/rastreio/loja-exemplo"'));
  assert.deepEqual(chamadas, ["slug:loja-exemplo", "loja:loja-a"]);
});

test("slug fora do formato nem consulta; loja sem rastreio ligado é 404", async () => {
  for (const slug of ["Loja-Exemplo", "_dominio", "lo", "a".repeat(41), "loja--exemplo"]) {
    const { deps, chamadas } = cenario();
    const res = await responderBusca(pedido(`/rastreio/${slug}`), slug, deps);
    assert.equal(res.status, 404, slug);
    cabecalhosHtml(res);
    assert.ok((await res.text()).includes("Página não encontrada"), slug);
    assert.deepEqual(chamadas, [], slug);
  }
  const { deps } = cenario({ config: null });
  assert.equal((await responderBusca(pedido("/rastreio/loja-exemplo"), "loja-exemplo", deps)).status, 404);
  const semLoja = cenario({ loja: null });
  assert.equal((await responderBusca(pedido("/rastreio/loja-exemplo"), "loja-exemplo", semLoja.deps)).status, 404);
});

test("um pedido abre direto (303); documento e celular do jeito que a pessoa digita", async () => {
  assert.equal(CPF, "11144477735");
  assert.equal(CNPJ, "11222333000181");
  const { deps, buscas } = cenario({ achados: [achado("1001", TOKEN)] });
  const res = await responderBusca(postar({ documento: CPF_DIGITADO, celular: "+55 (11) 98765-4321" }), "loja-exemplo", deps);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), `/rastreio/loja-exemplo/${TOKEN}`);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(buscas, [["loja-a", docHmac(CPF, PEPPER), "4321", new Date(AGORA.getTime() - 90 * 86_400_000)]]);

  const cnpj = cenario({ achados: [achado("1001", TOKEN)] });
  await responderBusca(postar({ documento: CNPJ_DIGITADO, celular: "11987654321" }), "loja-exemplo", cnpj.deps);
  assert.equal(cnpj.buscas[0][1], docHmac(CNPJ, PEPPER));
});

test("dois ou mais: a lista, na ordem do banco", async () => {
  const t2 = "0123456789abcdef0123456789abcd02";
  const t1 = "0123456789abcdef0123456789abcd01";
  const { deps } = cenario({ achados: [achado("1002", t2), achado("1001", t1)] });
  const res = await responderBusca(postar({ documento: CPF_DIGITADO, celular: "4321" }), "loja-exemplo", deps);
  assert.equal(res.status, 200);
  cabecalhosHtml(res);
  const html = await res.text();
  const i2 = html.indexOf(`href="/rastreio/loja-exemplo/${t2}"`);
  const i1 = html.indexOf(`href="/rastreio/loja-exemplo/${t1}"`);
  assert.ok(i2 > 0 && i1 > i2);
});

test("não achei, não confere e documento inválido: a mesma tela, e a consulta roda nas três", async () => {
  const { deps, buscas } = cenario({ achados: [] });
  const textos: string[] = [];
  for (const documento of [CPF_DIGITADO, CNPJ_DIGITADO, "123.456"]) {
    const res = await responderBusca(postar({ documento, celular: "4321" }), "loja-exemplo", deps);
    assert.equal(res.status, 200, documento);
    textos.push(await res.text());
  }
  assert.equal(textos[1], textos[0]);
  assert.equal(textos[2], textos[0]);
  assert.ok(textos[0].includes(NAO_ENCONTRADO));
  assert.equal(buscas.length, 3);
  assert.equal(buscas[2][1], docHmac("123456", PEPPER));
  for (const html of textos) {
    assert.ok(!html.includes(CPF_DIGITADO));
    assert.ok(!html.includes(CPF));
  }
});

test("6ª busca no minuto: 429 com 'Muitas tentativas', sem consultar", async () => {
  const conta: Record<string, number> = {};
  const { deps, buscas } = cenario({ limitar: async (id, max) => (conta[id] = (conta[id] ?? 0) + 1) > max });
  const status: number[] = [];
  let ultimo = "";
  for (let i = 0; i < 6; i++) {
    const res = await responderBusca(postar({ documento: CPF_DIGITADO, celular: "4321" }), "loja-exemplo", deps);
    status.push(res.status);
    ultimo = await res.text();
  }
  assert.deepEqual(status, [200, 200, 200, 200, 200, 429]);
  assert.ok(ultimo.includes(MUITAS_TENTATIVAS));
  assert.equal(buscas.length, 5);
});

test("o limite é por IP (com hash) e loja, um balde por janela, e o da hora também barra", async () => {
  const gravados: [string, number, number][] = [];
  const { deps } = cenario({
    limitar: async (id, max, janela) => {
      gravados.push([id, max, janela]);
      return false;
    },
  });
  await responderBusca(postar({ documento: CPF_DIGITADO, celular: "4321" }), "loja-exemplo", deps);
  assert.equal(gravados.length, 3);
  const [[id1, max1, j1], [id2, max2, j2]] = gravados;
  assert.match(id1, /^rastreio-busca-min:[0-9a-f]{32}:loja-a$/);
  assert.match(id2, /^rastreio-busca-h:[0-9a-f]{32}:loja-a$/);
  assert.deepEqual([max1, j1, max2, j2], [5, 60_000, 20, 3_600_000]);
  for (const [id] of gravados) assert.ok(!id.includes("203.0.113.10"));

  const daHora = cenario({ limitar: async (id) => id.startsWith("rastreio-busca-h:") });
  const res = await responderBusca(postar({ documento: CPF_DIGITADO, celular: "4321" }), "loja-exemplo", daHora.deps);
  assert.equal(res.status, 429);
  assert.equal(daHora.buscas.length, 0);
});

test("teto por documento: a 11ª busca com o mesmo CPF, de IPs diferentes, é 429 e não consulta", async () => {
  const conta: Record<string, number> = {};
  const { deps, buscas } = cenario({ limitar: async (id, max) => (conta[id] = (conta[id] ?? 0) + 1) > max });
  const status: number[] = [];
  for (let i = 0; i < 11; i++) {
    const res = await responderBusca(postar({ documento: CPF_DIGITADO, celular: "4321" }, { ip: `198.51.100.${i + 1}` }), "loja-exemplo", deps);
    status.push(res.status);
  }
  assert.deepEqual(status, [...Array<number>(10).fill(200), 429]);
  assert.equal(buscas.length, 10);
  const chaves = Object.keys(conta).filter((k) => k.startsWith("rastreio-busca-doc:"));
  assert.deepEqual(chaves, [`rastreio-busca-doc:loja-a:${docHmac(CPF, PEPPER)}`]);
  assert.ok(!chaves[0].includes(CPF));
});

test("os três baldes falham fechado (maxSeFalhar)", async () => {
  const opcoes: Record<string, unknown> = {};
  const { deps } = cenario({
    limitar: async (id, _max, _janela, o) => {
      opcoes[id.split(":")[0]] = o;
      return false;
    },
  });
  await responderBusca(postar({ documento: CPF_DIGITADO, celular: "4321" }), "loja-exemplo", deps);
  assert.deepEqual(opcoes, {
    "rastreio-busca-min": { maxSeFalhar: 5 },
    "rastreio-busca-h": { maxSeFalhar: 20 },
    "rastreio-busca-doc": { maxSeFalhar: 10 },
  });
});

test("corpo grande ou sem tamanho válido: 413 com a busca, sem ler nem consultar", async () => {
  for (const cl of ["2049", "abc"]) {
    const { deps, buscas } = cenario();
    const req = postar({ documento: CPF_DIGITADO, celular: "4321" });
    req.headers.set("content-length", cl);
    const res = await responderBusca(req, "loja-exemplo", deps);
    assert.equal(res.status, 413, cl);
    assert.ok((await res.text()).includes('name="documento"'));
    assert.equal(buscas.length, 0);
  }
});

test("sem o pepper a busca não roda", async () => {
  const { deps, buscas } = cenario({ pepper: new Error("RASTREIO_DOC_PEPPER ausente") });
  const res = await responderBusca(postar({ documento: CPF_DIGITADO, celular: "4321" }), "loja-exemplo", deps);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(buscas.length, 0);
});

test("página do token: só aquele pedido, nunca a busca", async () => {
  const { deps, chamadas, buscas } = cenario();
  const res = await responderPedido(pedido(`/rastreio/loja-exemplo/${TOKEN}`), "loja-exemplo", TOKEN, deps);
  assert.equal(res.status, 200);
  cabecalhosHtml(res);
  const html = await res.text();
  assert.ok(html.includes("Pedido nº 1001"));
  assert.ok(chamadas.includes(`token:loja-a:${TOKEN}`));
  assert.equal(buscas.length, 0);
  assert.ok(!html.includes("lista-pedidos"));
});

test("token fora do formato ou de outra loja: 404 com a busca", async () => {
  const errado = cenario();
  const res = await responderPedido(pedido("/rastreio/loja-exemplo/abc"), "loja-exemplo", "abc", errado.deps);
  assert.equal(res.status, 404);
  assert.ok(!errado.chamadas.some((c) => c.startsWith("token:")));
  const html = await res.text();
  assert.ok(html.includes(PEDIDO_NAO_ENCONTRADO));
  assert.ok(html.includes('name="documento"'));

  const outra = cenario({ porToken: null });
  const res2 = await responderPedido(pedido(`/rastreio/loja-exemplo/${TOKEN}`), "loja-exemplo", TOKEN, outra.deps);
  assert.equal(res2.status, 404);
  const html2 = await res2.text();
  assert.ok(html2.includes(PEDIDO_NAO_ENCONTRADO));
  assert.ok(html2.includes('name="documento"'));
});

test("banco fora: 503 de texto", async () => {
  const { deps } = cenario({ config: new Error("banco fora") });
  const res = await responderBusca(pedido("/rastreio/loja-exemplo"), "loja-exemplo", deps);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
  const res2 = await responderPedido(pedido(`/rastreio/loja-exemplo/${TOKEN}`), "loja-exemplo", TOKEN, deps);
  assert.equal(res2.status, 503);
});
