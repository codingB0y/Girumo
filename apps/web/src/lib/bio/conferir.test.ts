import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { documentoPadrao, type DocumentoBio, type LinkBio } from "./documento";
import type * as Conferir from "./conferir";

/**
 * As conferências contra um PostgREST de mentira (padrão de `vendas.test.ts`): o que sai daqui
 * são as queries reais de `media-store`, `campaign-groups`, `tracked-links` e `instances`, e o
 * teste confere o filtro de loja em cada uma. Dados fictícios (repositório público).
 */

type Visto = { url: URL };
const vistos: Visto[] = [];

/** O "banco": o que cada tabela devolve para a loja A. */
let banco: {
  uploads: string[]; // caminhos `uploads/<loja>/media/<arquivo>` com kind lp-*
  campanhas: { id: string; slug: string }[];
  links: { slug: string; campaign_group_id: string }[];
  telefones: (string | null)[];
};

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  vistos.push({ url });
  const lista = (nome: string) => (url.searchParams.get(nome) ?? "").replace(/^in\.\(|\)$/g, "").split(",");
  let corpo: unknown = [];
  if (url.pathname === "/rest/v1/uploads") corpo = banco.uploads.filter((p) => lista("path").includes(p)).map((path) => ({ path }));
  if (url.pathname === "/rest/v1/campaign_groups") corpo = banco.campanhas.map((c) => ({ ...c, tenant_id: LOJA, name: c.slug, group_ids: [], metadata: {} }));
  if (url.pathname === "/rest/v1/tracked_links") corpo = banco.links.filter((l) => lista("slug").includes(l.slug));
  if (url.pathname === "/rest/v1/instances") corpo = banco.telefones.map((phone, i) => ({ id: `inst-${i}`, tenant_id: LOJA, phone, status: "connected" }));
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(corpo));
});

let conferir: typeof Conferir;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  conferir = await import("./conferir");
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  vistos.length = 0;
  banco = { uploads: [], campanhas: [], links: [], telefones: [] };
});

const LOJA = "11111111-1111-4111-8111-111111111111";
const OUTRA = "22222222-2222-4222-8222-222222222222";
const C1 = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";
const C2 = "1c0b9d8e-7f60-4b4c-8d3e-2f1a0b9c8d7e";
const ZAP = "62999990000"; // loja: (62) 99999-0000

function caminho(loja: string, arquivo: string) {
  return `${loja}/media/${arquivo}.jpg`;
}
function midiaId(loja: string, arquivo: string) {
  return Buffer.from(caminho(loja, arquivo), "utf8").toString("base64url");
}
/** O mesmo caminho com os 2 bits de sobra do último caractere ligados: decodifica igual, mas não é o id canônico. */
function naoCanonico(id: string): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return id.slice(0, -1) + alfabeto[alfabeto.indexOf(id.slice(-1)) + 1];
}
const FOTO = "a1b2c3d4-0000-4000-8000-000000000001";
const FOTO2 = "a1b2c3d4-0000-4000-8000-000000000002";

let seq = 0;
function link(tipo: LinkBio["tipo"], extra: Record<string, unknown>): LinkBio {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  const base = { id, titulo: "Botão", sub: "", icone: "link", ativo: true };
  if (tipo === "endereco") return { ...base, tipo, endereco: "Rua Um, 100", horario: "", foto: null, ...extra } as LinkBio;
  return { ...base, tipo, destaque: false, ...extra } as LinkBio;
}

function documento(links: LinkBio[], muda: (d: DocumentoBio) => void = () => {}): DocumentoBio {
  const d = documentoPadrao({ nome: "Loja Exemplo", campanhaId: null });
  d.links = links;
  muda(d);
  return d;
}

const filtros = (pathname: string) => Object.fromEntries(vistos.find((v) => v.url.pathname === pathname)!.url.searchParams);

test("sem mídia, sem grupo e sem WhatsApp: ok, sem nenhuma consulta", async () => {
  const d = documento([link("link", { url: "https://lojaexemplo.com.br/", fotos: [] }), link("endereco", {})]);
  assert.deepEqual(await conferir.conferirDocumentoDaLoja(LOJA, d), { ok: true });
  assert.deepEqual(await conferir.estadoDosLinks(LOJA, d), { campanhas: {}, linksEscondidos: [] });
  assert.equal(vistos.length, 0);
});

test("mídia: só a da loja, com a linha lp-* em uploads, consultada pela loja", async () => {
  banco.uploads = [`uploads/${caminho(LOJA, FOTO)}`];
  const ok = documento([], (d) => { d.perfil.capa = { id: midiaId(LOJA, FOTO), foco: null }; });
  assert.deepEqual(await conferir.conferirDocumentoDaLoja(LOJA, ok), { ok: true });
  assert.deepEqual(filtros("/rest/v1/uploads"), {
    select: "path",
    tenant_id: `eq.${LOJA}`,
    bucket: "eq.uploads",
    kind: "in.(lp-media,lp-logo)",
    path: `in.(uploads/${caminho(LOJA, FOTO)})`,
  });

  // Arquivo da loja sem a linha em uploads (ou com kind privado): recusado.
  const semLinha = documento([link("link", { url: "https://lojaexemplo.com.br/", fotos: [{ id: midiaId(LOJA, FOTO2), foco: null }] })]);
  assert.deepEqual(await conferir.conferirDocumentoDaLoja(LOJA, semLinha), { ok: false, error: "Essa imagem não está na sua loja. Envie de novo.", campo: "links.0.fotos.0" });
});

test("mídia de outra loja ou id que não é o caminho canônico: recusada sem nem ir ao banco", async () => {
  const torto = naoCanonico(midiaId(LOJA, FOTO));
  assert.equal(Buffer.from(torto, "base64url").toString("utf8"), caminho(LOJA, FOTO), "mesmo caminho, outro id");
  for (const id of [midiaId(OUTRA, FOTO), "abc", torto]) {
    vistos.length = 0;
    banco.uploads = [`uploads/${caminho(LOJA, FOTO)}`, `uploads/${caminho(OUTRA, FOTO)}`];
    const d = documento([], (x) => { x.perfil.logoClara = { id, foco: null }; });
    const r = await conferir.conferirDocumentoDaLoja(LOJA, d);
    assert.equal(r.ok === false && r.campo, "perfil.logoClara", id);
    assert.equal(vistos.filter((v) => v.url.pathname === "/rest/v1/uploads").length, 0, id);
  }
});

test("campanha que não é da loja (ou foi apagada): erro no campo da campanha", async () => {
  banco.campanhas = [{ id: C1, slug: "vip-atacado" }];
  const d = documento([link("grupo", { campanhaId: C1 }), link("grupo", { campanhaId: C2 })]);
  assert.deepEqual(await conferir.conferirDocumentoDaLoja(LOJA, d), { ok: false, error: "Essa campanha não existe mais. Escolha outra.", campo: "links.1.campanhaId" });
  assert.equal(filtros("/rest/v1/campaign_groups").tenant_id, `eq.${LOJA}`);
});

test("número que a Girumo usa para postar: recusado no WhatsApp e no wa.me, com ou sem o nono dígito", async () => {
  banco.telefones = [null, `556299990000`]; // instância sem o 9 da frente
  const casos: [LinkBio, string][] = [
    [link("whatsapp", { numero: `55${ZAP}`, mensagem: "" }), "links.0.numero"],
    [link("link", { url: `https://wa.me/55${ZAP}?text=oi`, fotos: [] }), "links.0.url"],
    [link("link", { url: `https://api.whatsapp.com/send/?phone=55${ZAP}`, fotos: [] }), "links.0.url"],
  ];
  for (const [l, campo] of casos) {
    vistos.length = 0;
    assert.deepEqual(await conferir.conferirDocumentoDaLoja(LOJA, documento([l])), { ok: false, error: conferir.NUMERO_CONECTADO, campo });
    assert.equal(filtros("/rest/v1/instances").tenant_id, `eq.${LOJA}`);
  }
  assert.deepEqual(await conferir.conferirDocumentoDaLoja(LOJA, documento([link("whatsapp", { numero: "5562988887777", mensagem: "" })])), { ok: true });
});

test("estado dos links: slug do link mestre, e some o que não pode sair", async () => {
  const C3 = "2d1c0e9f-8071-4c5d-9e4f-3a2b1c0d9e8f";
  banco.campanhas = [{ id: C1, slug: "vip-atacado" }, { id: C3, slug: "saldao" }];
  banco.links = [
    { slug: "vip-antigo", campaign_group_id: C1 }, // apelido de slug antigo
    { slug: "vip-atacado", campaign_group_id: C1 }, // o mestre
    { slug: "saldao", campaign_group_id: C1 }, // o slug do C3 num link do C1: o C3 não tem link mestre
  ];
  banco.telefones = [`55${ZAP}`];
  const vip = link("grupo", { campanhaId: C1 });
  const apagada = link("grupo", { campanhaId: C2 });
  const semMestre = link("grupo", { campanhaId: C3 });
  const conectado = { ...link("whatsapp", { numero: `55${ZAP}`, mensagem: "" }), ativo: false } as LinkBio;
  const atendimento = link("whatsapp", { numero: "5562988887777", mensagem: "" });
  const waMe = link("link", { url: `https://wa.me/55${ZAP}`, fotos: [] });
  const site = link("link", { url: "https://lojaexemplo.com.br/", fotos: [] });

  const r = await conferir.estadoDosLinks(LOJA, documento([vip, apagada, semMestre, conectado, atendimento, waMe, site]));
  assert.deepEqual(r.campanhas, { [C1]: "vip-atacado" });
  assert.deepEqual(r.linksEscondidos, [apagada.id, semMestre.id, conectado.id, waMe.id]);
  assert.deepEqual(filtros("/rest/v1/tracked_links"), {
    select: "slug,campaign_group_id",
    tenant_id: `eq.${LOJA}`,
    slug: "in.(vip-atacado,saldao)", // só as campanhas que existem na loja
  });
});

test("link mestre: a mesma regra que o painel usa no seletor de campanhas", async () => {
  banco.links = [{ slug: "vip-atacado", campaign_group_id: C1 }, { slug: "nome-velho", campaign_group_id: C2 }];
  assert.deepEqual(
    await conferir.linksMestresDasCampanhas(LOJA, [{ id: C1, slug: "vip-atacado" }, { id: C2, slug: "nome-novo" }]),
    { [C1]: "vip-atacado" },
  );
  vistos.length = 0;
  assert.deepEqual(await conferir.linksMestresDasCampanhas(LOJA, []), {});
  assert.equal(vistos.length, 0, "sem campanha, sem consulta");
});

test("muitas campanhas: slugs em lotes de 100 (o filtro vai na URL), todos com a loja", async () => {
  const campanhas = Array.from({ length: 150 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, slug: `campanha-${i}` }));
  banco.links = campanhas.map((c) => ({ slug: c.slug, campaign_group_id: c.id }));
  assert.equal(Object.keys(await conferir.linksMestresDasCampanhas(LOJA, campanhas)).length, 150);
  const pedidos = vistos.filter((v) => v.url.pathname === "/rest/v1/tracked_links");
  assert.deepEqual(pedidos.map((v) => (v.url.searchParams.get("slug") ?? "").split(",").length).sort((a, b) => b - a), [100, 50]);
  for (const v of pedidos) assert.equal(v.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
});

test("número de um endereço do WhatsApp", () => {
  assert.equal(conferir.numeroDoLinkWhatsapp("https://wa.me/5562999990000?text=oi"), "5562999990000");
  assert.equal(conferir.numeroDoLinkWhatsapp("https://api.whatsapp.com/send?phone=%2B55%2062%2099999-0000"), "5562999990000");
  assert.equal(conferir.numeroDoLinkWhatsapp("https://wa.me/message/ABCDEF"), null);
  assert.equal(conferir.numeroDoLinkWhatsapp("https://wa.me/c/5562999990000"), "5562999990000");
  assert.equal(conferir.numeroDoLinkWhatsapp("https://wa.me/p/1234567890123456/5562999990000"), "5562999990000");
  assert.equal(conferir.numeroDoLinkWhatsapp("https://wa.me/c/abc"), null);
  assert.equal(conferir.numeroDoLinkWhatsapp("https://whatsapp.com/channel/0029Va"), null);
  assert.equal(conferir.numeroDoLinkWhatsapp("https://lojaexemplo.com.br/?phone=5562999990000"), null);
  assert.equal(conferir.numeroDoLinkWhatsapp("não é url"), null);
});
