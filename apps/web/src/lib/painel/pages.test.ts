import assert from "node:assert/strict";
import { test } from "node:test";

import {
  caminhoDaPagina,
  cenaDasPaginas,
  chipDaPagina,
  estadoDoDuplicar,
  linhaDeConversao,
  linkDaPagina,
  ordenarPaginas,
  type PaginaNaEtiqueta,
} from "./pages";

function pagina(over: Partial<PaginaNaEtiqueta> = {}): PaginaNaEtiqueta {
  return {
    id: "p1",
    slug: "oferta-setembro",
    status: "published",
    views_count: 128,
    leads_count: 3,
    content: { store_name: "Mega Stock" },
    ...over,
  };
}

test("carregando ganha de vazio: lista em voo não é 'nenhuma página'", () => {
  assert.equal(cenaDasPaginas({ carga: "carregando", total: 0 }), "carregando");
  assert.equal(cenaDasPaginas({ carga: "carregando", total: 5 }), "carregando");
});

test("erro da carga é cena própria, e vazio só com a resposta em mãos", () => {
  // Mutante: mover `total === 0` para cima ofereceria "Crie a primeira" a
  // quem na verdade teve a consulta falhando.
  assert.equal(cenaDasPaginas({ carga: "erro", total: 0 }), "erro");
  assert.equal(cenaDasPaginas({ carga: "ok", total: 0 }), "vazio");
  assert.equal(cenaDasPaginas({ carga: "ok", total: 2 }), "lista");
});

test("chip: só a página no ar usa Acid", () => {
  assert.deepEqual(chipDaPagina("published"), { texto: "No ar", tom: "acid" });
  assert.deepEqual(chipDaPagina("paused"), { texto: "Pausada", tom: "line" });
  assert.deepEqual(chipDaPagina("draft"), { texto: "Rascunho", tom: "line" });
});

test("página sem visita não converteu 0% — não teve chance", () => {
  // Mutante: calcular a taxa sem checar as visitas devolve NaN% (0/0) e
  // acusa de fracasso quem publicou hoje de manhã.
  const nova = linhaDeConversao(pagina({ views_count: 0, leads_count: 0 }));
  assert.deepEqual(nova, { tipo: "sem-visitas", texto: "Nenhuma visita ainda" });
});

test("lead sem visita contada aparece, em vez de virar 'nenhuma visita'", () => {
  const torta = linhaDeConversao(pagina({ views_count: 0, leads_count: 2 }));
  assert.deepEqual(torta, { tipo: "sem-visitas", texto: "2 leads · sem visita registrada" });
});

test("conversão em pt-BR, com singular e porcentagem arredondada", () => {
  const linha = linhaDeConversao(pagina({ views_count: 1280, leads_count: 32 }));
  assert.equal(linha.tipo, "conversao");
  if (linha.tipo !== "conversao") return;
  assert.equal(linha.texto, "32 leads em 1.280 visitas");
  assert.equal(linha.porcentagem, "3%");

  const uma = linhaDeConversao(pagina({ views_count: 1, leads_count: 1 }));
  assert.equal(uma.tipo === "conversao" && uma.texto, "1 lead em 1 visita");
});

test("a barra de conversão tem piso de 2% e teto de 100%", () => {
  const seca = linhaDeConversao(pagina({ views_count: 500, leads_count: 0 }));
  assert.equal(seca.tipo === "conversao" && seca.taxa, 0.02);
  // Mutante: sem o teto, lead sem visita contada estoura o trilho.
  const estourada = linhaDeConversao(pagina({ views_count: 2, leads_count: 9 }));
  assert.equal(estourada.tipo === "conversao" && estourada.taxa, 1);
});

test("caminho curto na lista, link inteiro só para copiar", () => {
  assert.equal(caminhoDaPagina("oferta-setembro"), "/p/oferta-setembro");
  assert.equal(
    linkDaPagina("https://app.girumo.com.br", "oferta-setembro"),
    "https://app.girumo.com.br/p/oferta-setembro",
  );
  // Mutante: montar sem o origin gera link que não leva a lugar nenhum ao colar.
  assert.equal(linkDaPagina("", "oferta-setembro"), null);
});

test("ordena por leads, depois visitas, depois nome — sem mexer no original", () => {
  const lista = [
    pagina({ id: "a", leads_count: 1, views_count: 10, content: { store_name: "A" } }),
    pagina({ id: "b", leads_count: 9, views_count: 10, content: { store_name: "B" } }),
    pagina({ id: "c", leads_count: 1, views_count: 90, content: { store_name: "C" } }),
  ];
  assert.deepEqual(
    ordenarPaginas(lista).map((p) => p.id),
    ["b", "c", "a"],
  );
  // Mutante: `paginas.sort(...)` sem cópia ordena o array do useState in place.
  assert.deepEqual(
    lista.map((p) => p.id),
    ["a", "b", "c"],
  );
});

test("empate total cai no nome da loja", () => {
  const lista = [
    pagina({ id: "z", content: { store_name: "Zebra" } }),
    pagina({ id: "a", content: { store_name: "Álamo" } }),
  ];
  assert.deepEqual(
    ordenarPaginas(lista).map((p) => p.id),
    ["a", "z"],
  );
});

test("duplicar em curso trava TODOS os botões, mas o spinner é só do clicado", () => {
  // Mutante: `desabilitado: ocupado` deixa os outros cartões clicáveis; a
  // segunda cópia dispara e as duas disputam para onde navegar.
  const clicado = estadoDoDuplicar("p1", "p1");
  assert.deepEqual(clicado, { ocupado: true, desabilitado: true, texto: "Duplicando..." });

  const vizinho = estadoDoDuplicar("p2", "p1");
  assert.deepEqual(vizinho, { ocupado: false, desabilitado: true, texto: "Duplicar" });

  const parado = estadoDoDuplicar("p2", null);
  assert.deepEqual(parado, { ocupado: false, desabilitado: false, texto: "Duplicar" });
});
