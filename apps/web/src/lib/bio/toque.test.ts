import assert from "node:assert/strict";
import { test } from "node:test";

import type { DadosRender } from "@/lib/bio/documento";
import { customHostRoute, skipsFirstPartyMiddleware } from "@/lib/custom-domains/host";
import { IDS, dadosFalsos } from "@/test/bio-dados-falsos";
import { responderToque, type DepsToque } from "./toque";

/**
 * `responderToque` com o cache e o banco trocados por funções (`DepsToque`): o
 * `paginaPublicaPorId` de verdade usa `unstable_cache`, que não roda fora do Next.
 * O teto é o de verdade (sem Upstash, o `checkRateLimit` cai no balde em memória):
 * cada teste usa um IP próprio do bloco de documentação (RFC 5737).
 */

const ROTA = "https://www.girumo.com.br/api/p/bio/toque";
const GENTE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
/** uuid válido que não é botão da página. */
const OUTRO = "f0e1d2c3-b4a5-4968-8776-655443322110";

/** O corpo que o `sendBeacon` da página manda (script.ts): 87 bytes. */
const beacon = (p: string, l: string) => `{"p":"${p}","l":"${l}"}`;

function cenario(busca: DadosRender | null | Error = dadosFalsos()) {
  const buscados: string[] = [];
  const contados: [string, string][] = [];
  const deps: DepsToque = {
    porId: async (id: string) => {
      buscados.push(id);
      if (busca instanceof Error) throw busca;
      return busca;
    },
    contar: async (paginaId: string, alvo: string) => {
      contados.push([paginaId, alvo]);
    },
  };
  return { deps, buscados, contados };
}

function pedido(corpo: string, i: { ip: string; ua?: string | null; headers?: Record<string, string> }): Request {
  const headers: Record<string, string> = {
    "content-type": "text/plain;charset=UTF-8",
    "x-forwarded-for": i.ip,
    ...i.headers,
  };
  if (i.ua !== null) headers["user-agent"] = i.ua ?? GENTE;
  return new Request(ROTA, { method: "POST", headers, body: corpo });
}

test("toque em cada tipo de botão da página: 204 sem corpo, conta uma vez (página, link)", async () => {
  for (const link of [IDS.whatsapp, IDS.catalogo, IDS.grupo, IDS.endereco, IDS.canal]) {
    const { deps, buscados, contados } = cenario();
    const res = await responderToque(pedido(beacon(IDS.pagina, link), { ip: "203.0.113.70" }), deps);
    assert.equal(res.status, 204, link);
    assert.equal(await res.text(), "", link);
    assert.deepEqual(buscados, [IDS.pagina], link);
    assert.deepEqual(contados, [[IDS.pagina, link]], link);
  }
});

test("corpo: até 256 bytes lidos conta, 257 não, diga o Content-Length o que disser", async (t) => {
  t.mock.method(console, "warn", () => {});
  const valido = beacon(IDS.pagina, IDS.whatsapp); // espaço depois do JSON continua JSON válido
  const casos: [string, Record<string, string>, number][] = [
    [valido + " ".repeat(256 - valido.length), { "content-length": "99999" }, 1],
    [valido + " ".repeat(257 - valido.length), { "content-length": "10" }, 0],
  ];
  for (const [corpo, headers, esperado] of casos) {
    const { deps, buscados, contados } = cenario();
    const res = await responderToque(pedido(corpo, { ip: "203.0.113.71", headers }), deps);
    assert.equal(res.status, 204);
    assert.equal(contados.length, esperado, `${Buffer.byteLength(corpo)} bytes`);
    if (!esperado) assert.deepEqual(buscados, [], "consultou a página de um corpo recusado");
  }
});

test("corpo sem fim: para de ler logo depois do teto e responde 204", async (t) => {
  t.mock.method(console, "warn", () => {});
  let puxadas = 0;
  const pedaco = new TextEncoder().encode(" ".repeat(64));
  const semFim = new ReadableStream<Uint8Array>({
    pull(controle) {
      puxadas += 1;
      controle.enqueue(pedaco);
    },
  });
  // `duplex` é exigido pelo undici para corpo em stream e não existe no RequestInit do lib.dom.
  const req = new Request(ROTA, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.72", "user-agent": GENTE },
    body: semFim,
    duplex: "half",
  } as RequestInit);
  const { deps, contados } = cenario();
  const res = await responderToque(req, deps);
  assert.equal(res.status, 204);
  assert.ok(puxadas <= 8, `leu ${puxadas} pedaços de 64 bytes`);
  assert.deepEqual(contados, []);
});

test("corpo que para no meio: desiste em 2 s e responde 204 sem contar", { timeout: 5_000 }, async (t) => {
  const avisos = t.mock.method(console, "warn", () => {});
  let puxadas = 0;
  // Manda o começo do beacon e trava: o resto nunca chega e a conexão não fecha.
  const parado = new ReadableStream<Uint8Array>({
    pull(controle) {
      puxadas += 1;
      if (puxadas > 1) return new Promise<void>(() => {});
      controle.enqueue(new TextEncoder().encode(`{"p":"${IDS.pagina}",`));
    },
  });
  const req = new Request(ROTA, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.80", "user-agent": GENTE },
    body: parado,
    duplex: "half",
  } as RequestInit);
  const { deps, buscados, contados } = cenario();
  const inicio = Date.now();
  const res = await responderToque(req, deps);
  const esperou = Date.now() - inicio;
  assert.equal(res.status, 204);
  assert.ok(esperou >= 1_900, `desistiu em ${esperou} ms, antes do prazo`);
  assert.deepEqual([...buscados, ...contados], []);
  assert.equal(avisos.mock.callCount(), 1, "recusa sem log");
});

test("JSON ruim e ids fora do formato: 204 sem consultar a página nem contar, com o motivo no log", async (t) => {
  const avisos = t.mock.method(console, "warn", () => {});
  const casos = [
    "",
    "oi",
    "null",
    "[]",
    '{"p":1,"l":2}',
    `{"p":"${IDS.pagina}"}`,
    beacon(IDS.pagina.toUpperCase(), IDS.whatsapp),
    beacon(IDS.pagina, IDS.whatsapp.toUpperCase()),
    // O alvo da visita: o check de bio_contagens aceita 'visita', e o toque não pode somar visita.
    beacon(IDS.pagina, "visita"),
    beacon(IDS.pagina, IDS.whatsapp.replaceAll("-", "")),
    beacon(` ${IDS.pagina}`, IDS.whatsapp),
  ];
  for (const corpo of casos) {
    const { deps, buscados, contados } = cenario();
    const res = await responderToque(pedido(corpo, { ip: "203.0.113.73" }), deps);
    assert.equal(res.status, 204, corpo);
    assert.deepEqual([...buscados, ...contados], [], corpo);
  }
  assert.equal(avisos.mock.callCount(), casos.length, "recusa sem log");
});

test("página não publicada, bloqueada ou inexistente (o cache devolve null): 204 sem contar", async (t) => {
  const avisos = t.mock.method(console, "warn", () => {});
  const { deps, buscados, contados } = cenario(null);
  const res = await responderToque(pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.74" }), deps);
  assert.equal(res.status, 204);
  assert.deepEqual(buscados, [IDS.pagina]);
  assert.deepEqual(contados, []);
  assert.equal(avisos.mock.callCount(), 1, "recusa sem log");
  assert.deepEqual(
    avisos.mock.calls.map((c) => c.arguments[0]),
    [`[bio/toque] ${IDS.pagina}: página não publicada, bloqueada ou inexistente`],
  );
});

test("link que a página não mostra: escondido, desligado, sem link mestre ou de outra página", async (t) => {
  const avisos = t.mock.method(console, "warn", () => {});
  const d = dadosFalsos();
  const desligado: DadosRender = {
    ...d,
    documento: { ...d.documento, links: d.documento.links.map((l) => (l.id === IDS.canal ? { ...l, ativo: false } : l)) },
  };
  const casos: [DadosRender, string][] = [
    [{ ...d, linksEscondidos: [IDS.whatsapp] }, IDS.whatsapp], // número que virou conectado
    [desligado, IDS.canal],
    [{ ...d, campanhas: {} }, IDS.grupo], // campanha apagada ou sem link mestre
    [d, OUTRO],
  ];
  for (const [dados, link] of casos) {
    const { deps, contados } = cenario(dados);
    const res = await responderToque(pedido(beacon(IDS.pagina, link), { ip: "203.0.113.75" }), deps);
    assert.equal(res.status, 204, link);
    assert.deepEqual(contados, [], link);
  }
  assert.equal(avisos.mock.callCount(), casos.length, "recusa sem log");
  assert.deepEqual(
    avisos.mock.calls.map((c) => c.arguments[0]),
    casos.map(([, link]) => `[bio/toque] ${IDS.pagina}: o link ${link} não está na página publicada`),
  );
});

test("robô (prévia de link, navegador headless, sem user agent): 204 sem ler corpo nem página", async () => {
  for (const ua of ["facebookexternalhit/1.1", "Mozilla/5.0 HeadlessChrome/120.0", "WhatsApp/2.23.20.0", null]) {
    const { deps, buscados, contados } = cenario();
    const res = await responderToque(pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.76", ua }), deps);
    assert.equal(res.status, 204, String(ua));
    assert.deepEqual([...buscados, ...contados], [], String(ua));
  }
});

test("beacon de outro site (Sec-Fetch-Site cross-site ou same-site): 204 sem ler corpo nem página; same-origin e sem o header contam", async (t) => {
  const avisos = t.mock.method(console, "warn", () => {});
  for (const site of ["cross-site", "same-site"]) {
    const { deps, buscados, contados } = cenario();
    const req = pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.81", headers: { "sec-fetch-site": site } });
    const res = await responderToque(req, deps);
    assert.equal(res.status, 204, site);
    assert.equal(req.bodyUsed, false, site);
    assert.deepEqual([...buscados, ...contados], [], site);
  }
  // Sem o header: WebView antigo, que não manda Sec-Fetch-*.
  const contam: Record<string, string>[] = [{ "sec-fetch-site": "same-origin" }, {}];
  for (const headers of contam) {
    const { deps, contados } = cenario();
    const res = await responderToque(pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.81", headers }), deps);
    assert.equal(res.status, 204);
    assert.deepEqual(contados, [[IDS.pagina, IDS.whatsapp]], JSON.stringify(headers));
  }
  assert.equal(avisos.mock.callCount(), 0, "outro site fica calado, como o robô");
});

test("teto por IP e página: o 31º toque do minuto não conta; outro IP conta", async () => {
  const { deps, contados } = cenario();
  for (let i = 0; i < 31; i++) {
    const res = await responderToque(pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.77" }), deps);
    assert.equal(res.status, 204);
  }
  await responderToque(pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.78" }), deps);
  assert.equal(contados.length, 31);
});

test("cache ou banco fora do ar: 204 e o erro no log", async (t) => {
  const erros = t.mock.method(console, "error", () => {});
  const caiu = cenario(new Error("banco caiu"));
  const r1 = await responderToque(pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.79" }), caiu.deps);
  const naoContou = cenario();
  naoContou.deps.contar = async () => {
    throw new Error("rpc falhou");
  };
  const r2 = await responderToque(pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.79" }), naoContou.deps);
  assert.deepEqual([r1.status, r2.status], [204, 204]);
  assert.equal(erros.mock.callCount(), 2);
});

test("o beacon passa sem sessão nos dois hosts (/api/p/* é público)", () => {
  // Host do Girumo: a primeira entrada do matcher pula /api/p/ e o middleware nem roda.
  assert.equal(skipsFirstPartyMiddleware("/api/p/bio/toque"), true);
  // Domínio do lojista: o beacon sai pro mesmo host, e lá /api/p/* é "public-api".
  assert.equal(customHostRoute("/api/p/bio/toque"), "public-api");
});
