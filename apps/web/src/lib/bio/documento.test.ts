import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ICONES,
  MODELOS,
  PALETAS,
  SLUG_BIO,
  UUID_BIO,
  documentoBio,
  documentoPadrao,
  slugReservado,
  type DocumentoBio,
  type LinkBio,
} from "./documento";

/** Dados fictícios: o repositório é público, nada da loja-piloto aqui. */
const L1 = "11111111-2222-4333-8444-555555555555";
const L3 = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

const CAMPANHA = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";
const L2 = "66666666-7777-4888-9999-aaaaaaaaaaaa";

function documento(muda: (d: DocumentoBio) => void = () => {}): DocumentoBio {
  const d = documentoPadrao({ nome: "Loja Exemplo Atacado", campanhaId: CAMPANHA });
  d.links = [
    { id: L1, tipo: "whatsapp", titulo: "Falar com a vendedora", sub: "", icone: "whatsapp", ativo: true, destaque: true, numero: "(62) 99999-0000", mensagem: "Oi!" },
    { id: L2, tipo: "link", titulo: "Catálogo", sub: "", icone: "catalogo", ativo: true, destaque: false, url: "lojaexemplo.com.br/catalogo", fotos: [] },
    { id: L3, tipo: "endereco", titulo: "Como chegar", sub: "", icone: "mapa", ativo: true, endereco: "Rua Um, 100\nCentro", horario: "", foto: null },
  ];
  muda(d);
  return d;
}

/** Primeiro erro como a API e o painel vão mostrar: o caminho do campo e a frase. */
function primeiroErro(bruto: unknown, caso = ""): { campo: string; mensagem: string } {
  const r = documentoBio.safeParse(bruto);
  assert.equal(r.success, false, `esperava erro de validação: ${caso}`);
  const issue = r.error!.issues[0];
  return { campo: issue.path.join("."), mensagem: issue.message };
}

function valido(bruto: unknown): DocumentoBio {
  const r = documentoBio.safeParse(bruto);
  assert.ok(r.success, r.success ? "" : JSON.stringify(r.error.issues));
  return r.data;
}

test("listas fechadas do contrato (spec §9)", () => {
  assert.deepEqual(MODELOS, ["etiqueta", "vitrine", "romaneio", "classico"]);
  assert.deepEqual(PALETAS, {
    etiqueta: ["azul", "rosa", "menta", "grafite"],
    vitrine: ["papel", "noite", "rose", "azul"],
    romaneio: ["kraft", "caneta", "nota", "azul"],
    classico: ["claro", "escuro", "lavanda", "azul"],
  });
  assert.equal(ICONES.length, 13);
  assert.ok(ICONES.includes("caminhao") && ICONES.includes("link"));
});

test("slug: 3 a 40, minúsculas, números e hífen simples", () => {
  for (const ok of ["abc", "loja-exemplo", "a1-b2-c3", "x".repeat(40)]) assert.ok(SLUG_BIO.test(ok), ok);
  for (const ruim of ["ab", "x".repeat(41), "Loja", "loja--x", "-loja", "loja-", "lója", "loja_x", "_dominio", "a b"]) {
    assert.equal(SLUG_BIO.test(ruim), false, ruim);
  }
});

test("slug reservado: a lista e qualquer um com girumo ou hubflow", () => {
  for (const s of ["_dominio", "admin", "api", "bio", "girumo", "painel", "login", "ajuda", "suporte", "loja-girumo-oficial", "hubflowx"]) {
    assert.equal(slugReservado(s), true, s);
  }
  assert.equal(slugReservado("loja-exemplo"), false);
});

test("uuid minúsculo, o formato do CHECK de bio_contagens.alvo", () => {
  assert.ok(UUID_BIO.test(L1));
  assert.equal(UUID_BIO.test(L3.toUpperCase()), false);
  assert.equal(UUID_BIO.test("visita"), false);
});

test("página padrão: Etiqueta azul, nome da loja e o grupo VIP quando há campanha", () => {
  const d = valido(documentoPadrao({ nome: "  Loja Exemplo  ", campanhaId: CAMPANHA }));
  assert.equal(d.modelo, "etiqueta");
  assert.equal(d.paleta, "azul");
  assert.equal(d.cores, null);
  assert.equal(d.animar, true);
  assert.equal(d.feitoComGirumo, true);
  assert.equal(d.perfil.nome, "Loja Exemplo");
  assert.equal(d.links.length, 1);
  const vip = d.links[0];
  assert.equal(vip.tipo, "grupo");
  assert.match(vip.id, UUID_BIO);
  assert.equal(vip.titulo, "Entrar no grupo VIP");
  assert.equal(vip.icone, "coroa");
  assert.equal(vip.tipo === "grupo" && vip.campanhaId, CAMPANHA);
  assert.equal(documentoPadrao({ nome: "Loja", campanhaId: null }).links.length, 0);
  assert.equal(documentoPadrao({ nome: "   ", campanhaId: null }).perfil.nome, "Minha loja");
  assert.equal(documentoPadrao({ nome: "x".repeat(80), campanhaId: null }).perfil.nome.length, 60);
  // A API e o painel salvam o padrão como sai daqui: ele sempre passa no schema, com e sem campanha.
  for (const nome of ["Loja", "   ", "x".repeat(80), `${"x".repeat(59)}🌸 e mais`]) {
    for (const campanhaId of [CAMPANHA, null]) valido(documentoPadrao({ nome, campanhaId }));
  }
});

test("normaliza número, endereço, CNPJ, cores e @ do Instagram", () => {
  const d = valido(
    documento((x) => {
      x.paleta = "marca";
      x.cores = { fundo: "#286aa6", botao: " #e98b2b " };
      x.perfil.instagram = " @LojaExemplo ";
      x.confere = { ativo: true, razao: "Loja Exemplo Ltda", cnpj: "11.222.333/0001-81", linhas: [] };
    }),
  );
  const [zap, site] = d.links as [Extract<LinkBio, { tipo: "whatsapp" }>, Extract<LinkBio, { tipo: "link" }>];
  assert.equal(zap.numero, "5562999990000");
  assert.equal(site.url, "https://lojaexemplo.com.br/catalogo");
  assert.deepEqual(d.cores, { fundo: "#286AA6", botao: "#E98B2B" });
  assert.equal(d.perfil.instagram, "lojaexemplo");
  assert.equal(d.confere.cnpj, "11222333000181");
  // CNPJ alfanumérico (emitido desde julho de 2026): mesma conta, letra vale ASCII − 48.
  const alfa = valido(documento((x) => { x.confere.cnpj = "12.abc.345/01de-35"; }));
  assert.equal(alfa.confere.cnpj, "12ABC34501DE35");
  // Vazio continua valendo: o bloco só aparece com razão e CNPJ.
  assert.equal(valido(documento((x) => { x.confere.cnpj = ""; })).confere.cnpj, "");
});

test("texto do lojista é texto: a validação não apaga < nem aspas (quem protege é o escape)", () => {
  const d = valido(documento((x) => { x.perfil.frase = `Kits <b>"novos"</b> & 'baratos'`; }));
  assert.equal(d.perfil.frase, `Kits <b>"novos"</b> & 'baratos'`);
});

test("NUL e metade de emoji não chegam ao jsonb (seriam 500 no salvar)", () => {
  assert.equal(primeiroErro(documento((d) => { d.perfil.frase = "oi \u0000"; })).campo, "perfil.frase");
  assert.equal(primeiroErro(documento((d) => { d.links[0].titulo = "Falar \uD83D"; })).campo, "links.0.titulo");
  valido(documento((d) => { d.perfil.frase = "Kits novos 🌸"; }));
  // O nome padrão é cortado em 60 sem partir o emoji do fim.
  const nome = documentoPadrao({ nome: `${"x".repeat(59)}🌸 e mais`, campanhaId: null }).perfil.nome;
  assert.equal(nome, "x".repeat(59));
  valido(documentoPadrao({ nome: `${"x".repeat(58)}🌸`, campanhaId: null }));
});

test("campo desconhecido é erro, na raiz e dentro do link", () => {
  assert.equal(primeiroErro({ ...documento(), extra: 1 }).campo, "");
  const comExtra = documento() as unknown as { links: Record<string, unknown>[] };
  comExtra.links[0].href = "javascript:alert(1)";
  assert.equal(primeiroErro(comExtra).campo, "links.0");
});

test("host com porta e sem esquema não é lido como esquema", () => {
  const d = documento((x) => { (x.links[1] as { url: string }).url = "loja.com.br:8080/x"; });
  assert.equal((valido(d).links[1] as { url: string }).url, "https://loja.com.br:8080/x");
});

test("erros apontam o campo com a frase do painel", () => {
  const casos: [string, (d: DocumentoBio) => void, string, string | RegExp][] = [
    ["nome vazio", (d) => { d.perfil.nome = "  "; }, "perfil.nome", "Escreva o nome da loja."],
    ["título vazio", (d) => { d.links[0].titulo = ""; }, "links.0.titulo", "Escreva o texto do botão."],
    ["número curto", (d) => { (d.links[0] as { numero: string }).numero = "9999-0000"; }, "links.0.numero", /Número com DDD/],
    ["javascript:", (d) => { (d.links[1] as { url: string }).url = "javascript:alert(1)"; }, "links.1.url", /Só endereços de site/],
    ["sem ponto", (d) => { (d.links[1] as { url: string }).url = "localhost/catalogo"; }, "links.1.url", /não parece um link/],
    ["url vazia", (d) => { (d.links[1] as { url: string }).url = "  "; }, "links.1.url", "Cole o endereço do link."],
    ["url longa", (d) => { (d.links[1] as { url: string }).url = `loja.com.br/${"a".repeat(495)}`; }, "links.1.url", /até 500/],
    ["endereço curto", (d) => { (d.links[2] as { endereco: string }).endereco = "Rua"; }, "links.2.endereco", "Escreva o endereço da loja."],
    ["cnpj errado", (d) => { d.confere.cnpj = "11.222.333/0001-80"; }, "confere.cnpj", /CNPJ inválido/],
    ["cnpj repetido", (d) => { d.confere.cnpj = "00000000000000"; }, "confere.cnpj", /CNPJ inválido/],
    ["instagram", (d) => { d.perfil.instagram = "loja exemplo"; }, "perfil.instagram", /sem @/],
    ["pixel", (d) => { d.rastreio.metaPixelId = "12ab"; }, "rastreio.metaPixelId", /só números/],
    ["ga4", (d) => { d.rastreio.ga4Id = "UA-123"; }, "rastreio.ga4Id", /G-/],
    ["paleta de outro modelo", (d) => { d.paleta = "kraft"; }, "paleta", "Escolha uma das paletas do modelo."],
    ["marca sem cores", (d) => { d.paleta = "marca"; d.cores = null; }, "cores", "Escolha as duas cores da marca."],
    ["cor inválida", (d) => { d.cores = { fundo: "azul", botao: "#FFFFFF" }; }, "cores.fundo", "Escolha uma cor."],
    ["dois principais", (d) => { (d.links[1] as { destaque: boolean }).destaque = true; }, "links.1.destaque", "Só um link pode ser o principal."],
    ["id repetido", (d) => { d.links[2].id = L1; }, "links.2.id", "Link repetido. Apague um deles."],
    ["id maiúsculo", (d) => { d.links[0].id = L3.toUpperCase(); }, "links.0.id", /Link inválido/],
    ["campanha que não é uuid", (d) => { d.links.push({ ...(documentoPadrao({ nome: "x", campanhaId: CAMPANHA }).links[0] as LinkBio), campanhaId: "vip" } as LinkBio); }, "links.3.campanhaId", "Escolha a campanha."],
    ["mídia com barra", (d) => { d.perfil.capa = { id: "a/b", foco: null }; }, "perfil.capa.id", /Imagem inválida/],
    ["foco fora de 0..1", (d) => { d.perfil.capa = { id: "abc", foco: { x: 1.2, y: 0 } }; }, "perfil.capa.foco.x", /.+/],
    ["4 destaques", (d) => { d.perfil.destaques = ["a", "b", "c", "d"]; }, "perfil.destaques", "Até 3 destaques."],
    ["4 fotos", (d) => { (d.links[1] as { fotos: unknown[] }).fotos = [1, 2, 3, 4].map(() => ({ id: "abc", foco: null })); }, "links.1.fotos", "Até 3 fotos."],
    ["21 links", (d) => { d.links = Array.from({ length: 21 }, (_, i) => ({ ...d.links[2], id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000` })); }, "links", "Até 20 links."],
  ];
  for (const [nome, muda, campo, mensagem] of casos) {
    const e = primeiroErro(documento(muda), nome);
    assert.equal(e.campo, campo, nome);
    if (typeof mensagem === "string") assert.equal(e.mensagem, mensagem, nome);
    else assert.match(e.mensagem, mensagem, nome);
  }
});

test("endereço não tem principal: dois 'Como chegar' não contam como dois destaques", () => {
  valido(documento((d) => { d.links.push({ ...(d.links[2] as LinkBio), id: "cccccccc-dddd-4eee-8fff-000000000000" } as LinkBio); }));
});

test("links são uma união discriminada por tipo: o erro aponta o campo do próprio tipo", () => {
  // O painel (PR 6a) põe a mensagem no campo pelo caminho links.<n>.<campo>.
  const zap = documento((d) => {
    d.links.push({ id: "cccccccc-dddd-4eee-8fff-000000000000", tipo: "whatsapp", titulo: "Atacado", sub: "", icone: "whatsapp", ativo: true, destaque: false, numero: "123", mensagem: "" });
  });
  assert.deepEqual(primeiroErro(zap), { campo: "links.3.numero", mensagem: "Número com DDD, só o celular. Ex.: 62 99999-9999." });
  const tipoErrado = documento() as unknown as { links: Record<string, unknown>[] };
  tipoErrado.links[2].tipo = "telefone";
  assert.equal(primeiroErro(tipoErrado).campo, "links.2.tipo");
});

test("normalizar duas vezes dá o mesmo documento (o painel guarda o normalizado; a API valida de novo)", () => {
  const brutos: DocumentoBio[] = [
    documentoPadrao({ nome: " Loja Exemplo ", campanhaId: CAMPANHA }),
    documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }),
    documento((x) => {
      x.paleta = "marca";
      x.cores = { fundo: "#286aa6", botao: " #e98b2b " };
      x.perfil.frase = "  Kits novos toda semana  ";
      x.perfil.instagram = " @@LojaExemplo ";
      x.confere = { ativo: true, razao: " Loja Exemplo Ltda ", cnpj: "12.abc.345/01de-35", linhas: [" Desde 2010 "] };
      x.rastreio = { metaPixelId: " 123456789 ", ga4Id: " g-abc1234 " };
    }),
  ];
  // DDD 55 (Santa Maria/RS) é o caso em que o "55" do país e o do DDD se confundem.
  for (const numero of ["(62) 99999-0000", "+55 62 9 9999-0000", "5562999990000", "55 3222-1111", "(55) 99999-0000"]) {
    brutos.push(documento((x) => { (x.links[0] as { numero: string }).numero = numero; }));
  }
  for (const url of ["HTTPS://LojaExemplo.com.br/Catálogo?x=1#y", "lojá.com.br", "http://loja.com.br:80/a/../b"]) {
    brutos.push(documento((x) => { (x.links[1] as { url: string }).url = url; }));
  }
  for (const bruto of brutos) {
    const uma = valido(bruto);
    assert.deepEqual(valido(uma), uma);
  }
});
