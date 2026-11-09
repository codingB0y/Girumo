import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { avisarLojaDoProblema, registrarPedidoDaYampi, type DepsRegistrar } from "@/lib/rastreio/registrar";
import { MATRIZ_PADRAO, type PedidoGravado, type RastreioConfig } from "@/lib/rastreio/tipos";
import { pedidoYampi } from "@/test/rastreio-dados-falsos";

const CONFIG: RastreioConfig = {
  tenantId: "loja-a", publicSlug: "loja-teste", matrix: MATRIZ_PADRAO, notifyStoreOnProblem: true,
  vipLinkId: "link-vip", storeWhatsapp: "5511900000000", importedAt: null, sweepCursor: null,
};
const GRAVADO: PedidoGravado = {
  id: "ped-1", etapa: "enviado", etapaAnterior: "separando", mudou: true, linkToken: "0".repeat(32),
  paradoEm: null, temTelefone: true, temEmail: true,
};

function montar(extra: Partial<DepsRegistrar> = {}) {
  const log = { gravar: 0, config: 0, criar: [] as unknown[], loja: [] as unknown[] };
  const deps: DepsRegistrar = {
    pepper: () => "p".repeat(32),
    gravarPedido: async () => { log.gravar++; return GRAVADO; },
    lerConfig: async () => { log.config++; return CONFIG; },
    planoAtivo: async () => true,
    criarAvisos: async (t, o, e, canais) => { log.criar.push([t, o, e, canais]); return canais.map((canal, i) => ({ id: `av-${i}`, canal })); },
    avisarLoja: async (t, p) => { log.loja.push([t, p]); return true; },
    agora: () => new Date("2026-10-29T15:00:00Z"),
    ...extra,
  };
  return { deps, log };
}

test("etapa nova e recente vira aviso nos canais da matriz", async () => {
  const { deps, log } = montar();
  const r = await registrarPedidoDaYampi("loja-a", pedidoYampi(), "aviso", deps);
  assert.deepEqual(log.criar, [["loja-a", "ped-1", "enviado", ["whatsapp", "email"]]]);
  assert.deepEqual(r?.avisos, [{ id: "av-0", canal: "whatsapp" }, { id: "av-1", canal: "email" }]);
});

test("sem RASTREIO_DOC_PEPPER lança antes de gravar", async () => {
  const { deps, log } = montar({ pepper: () => { throw new Error("RASTREIO_DOC_PEPPER ausente ou com menos de 32 caracteres"); } });
  await assert.rejects(registrarPedidoDaYampi("loja-a", pedidoYampi(), "aviso", deps), /RASTREIO_DOC_PEPPER/);
  assert.equal(log.gravar, 0);
});

test("loja sem plano: grava o pedido e não cria aviso nem sininho", async () => {
  const { deps, log } = montar({ planoAtivo: async () => false });
  const gravar = deps.gravarPedido;
  deps.gravarPedido = async (...a) => ({ ...(await gravar(...a)), etapa: "problema" });
  assert.deepEqual((await registrarPedidoDaYampi("loja-a", pedidoYampi(), "aviso", deps))?.avisos, []);
  assert.deepEqual([log.gravar, log.criar, log.loja], [1, [], []]);
});

test("importação e etapa que não mudou não leem config", async () => {
  const a = montar();
  await registrarPedidoDaYampi("loja-a", pedidoYampi(), "importacao", a.deps);
  assert.equal(a.log.config, 0);
  assert.deepEqual(a.log.criar, []);
  const b = montar({ gravarPedido: async () => ({ ...GRAVADO, mudou: false }) });
  await registrarPedidoDaYampi("loja-a", pedidoYampi(), "aviso", b.deps);
  assert.equal(b.log.config, 0);
  assert.deepEqual(b.log.criar, []);
});

test("contato e 'parar avisos' vêm do gravado, não do payload", async () => {
  const canais = async (g: PedidoGravado) => {
    const { deps, log } = montar({ gravarPedido: async () => g });
    await registrarPedidoDaYampi("loja-a", pedidoYampi({ customer: undefined }), "aviso", deps);
    return (log.criar[0] as unknown[] | undefined)?.[3];
  };
  assert.deepEqual(await canais(GRAVADO), ["whatsapp", "email"]);
  assert.deepEqual(await canais({ ...GRAVADO, temEmail: false }), ["whatsapp"]);
  assert.equal(await canais({ ...GRAVADO, paradoEm: "2026-10-29T14:00:00Z" }), undefined);
});

test("problema sempre avisa a loja no sininho", async () => {
  const a = montar({ gravarPedido: async () => ({ ...GRAVADO, etapa: "problema" }) });
  await registrarPedidoDaYampi("loja-a", pedidoYampi(), "aviso", a.deps);
  assert.deepEqual(a.log.loja, [["loja-a", { id: "ped-1", numero: "1042" }]]);
  const b = montar({ gravarPedido: async () => ({ ...GRAVADO, etapa: "problema" }), lerConfig: async () => ({ ...CONFIG, notifyStoreOnProblem: false }) });
  await registrarPedidoDaYampi("loja-a", pedidoYampi(), "aviso", b.deps);
  assert.deepEqual(b.log.loja, [["loja-a", { id: "ped-1", numero: "1042" }]]);
});

test("payload fora do formato: null e nada gravado", async () => {
  const { deps, log } = montar();
  assert.equal(await registrarPedidoDaYampi("loja-a", {}, "aviso", deps), null);
  assert.equal(log.gravar, 0);
});

// --- sininho, com PostgREST falso ---
type Chamada = { metodo: string; url: URL; corpo: unknown };
const chamadas: Chamada[] = [];
let jaTem = false;
const postgrest = createServer((req, res) => {
  let texto = "";
  req.on("data", (c) => (texto += c));
  req.on("end", () => {
    chamadas.push({ metodo: req.method ?? "", url: new URL(req.url ?? "/", "http://postgrest.falso"), corpo: texto ? JSON.parse(texto) : null });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST") { res.statusCode = 201; res.end(); return; }
    res.end(JSON.stringify(jaTem ? [{ id: "n1" }] : []));
  });
});
before(async () => {
  await new Promise<void>((ok) => postgrest.listen(0, "127.0.0.1", ok));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(postgrest.address() as AddressInfo).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => { postgrest.close(); });

test("o sininho do problema nasce uma vez por pedido, apontando para Entregas", async () => {
  jaTem = false;
  assert.equal(await avisarLojaDoProblema("loja-a", { id: "ped-1", numero: "1042" }), true);
  const [busca, insert] = chamadas;
  assert.deepEqual(Object.fromEntries(busca.url.searchParams), { select: "id", tenant_id: "eq.loja-a", type: "eq.rastreio_problema", href: "eq./painel/vendas/entregas?pedido=ped-1", limit: "1" });
  assert.deepEqual(insert.corpo, { tenant_id: "loja-a", type: "rastreio_problema", title: "Problema na entrega do pedido nº 1042", body: "A transportadora não conseguiu entregar. Fale com a compradora.", href: "/painel/vendas/entregas?pedido=ped-1" });
  chamadas.length = 0; jaTem = true;
  assert.equal(await avisarLojaDoProblema("loja-a", { id: "ped-1", numero: "1042" }), false);
  assert.equal(chamadas.filter((c) => c.metodo === "POST").length, 0);
});
