import assert from "node:assert/strict";
import { test } from "node:test";

import {
  caminhoPublico,
  cenaDasCampanhas,
  chipDaCampanha,
  contarPorFiltro,
  filtrarCampanhas,
  linhaDeVagas,
  linkPublico,
  ordenarPorLotacao,
  quaseLotada,
  textoDeCliques,
  type CampanhaNaEtiqueta,
} from "./campanhas";

function campanha(over: Partial<CampanhaNaEtiqueta> = {}): CampanhaNaEtiqueta {
  return {
    campaign: { id: "c1", name: "Reativação", slug: "reativacao" },
    totalMembers: 475,
    totalCapacity: 2048,
    fillPct: 23,
    groupCount: 2,
    clicks: 12,
    operationalStatus: "ready",
    ...over,
  };
}

test("carregando ganha de tudo: lista vazia em voo não é 'nenhuma campanha'", () => {
  // Mutante: mover o teste de `total === 0` para cima faz a tela oferecer
  // "Crie a primeira" a quem tem 40 campanhas ainda chegando.
  assert.equal(cenaDasCampanhas({ carga: "carregando", total: 0, visiveis: 0 }), "carregando");
  assert.equal(cenaDasCampanhas({ carga: "carregando", total: 9, visiveis: 9 }), "carregando");
});

test("erro é cena própria, mesmo com campanhas já em mãos", () => {
  // Mutante: tratar erro como "lista" mostraria dado velho sem avisar que a
  // atualização falhou; tratar como "carregando" viraria esqueleto eterno.
  assert.equal(cenaDasCampanhas({ carga: "erro", total: 0, visiveis: 0 }), "erro");
  assert.equal(cenaDasCampanhas({ carga: "erro", total: 3, visiveis: 3 }), "erro");
});

test("vazio-total e filtro-sem-resultado são cenas diferentes", () => {
  // Mutante: fundir as duas (ou inverter a ordem) devolve "sem-resultado"
  // para quem nunca criou campanha — e some com o botão de criar a primeira.
  assert.equal(cenaDasCampanhas({ carga: "ok", total: 0, visiveis: 0 }), "vazio");
  assert.equal(cenaDasCampanhas({ carga: "ok", total: 3, visiveis: 0 }), "sem-resultado");
  assert.equal(cenaDasCampanhas({ carga: "ok", total: 3, visiveis: 1 }), "lista");
});

test("chip: só quem lotou usa Acid, e os estados de problema continuam visíveis", () => {
  assert.deepEqual(chipDaCampanha("full"), { texto: "Lotou", tom: "acid" });
  assert.deepEqual(chipDaCampanha("ready"), { texto: "Pronta", tom: "canvas" });
  assert.deepEqual(chipDaCampanha("needs_invites"), { texto: "Sem convite", tom: "line" });
  assert.deepEqual(chipDaCampanha("empty"), { texto: "Sem grupos", tom: "line" });
});

test("quase lotada começa em 85, não em 86", () => {
  // Mutante: `>` no lugar de `>=` tira a cor de Atenção justamente de quem
  // está no limiar.
  assert.equal(quaseLotada(84), false);
  assert.equal(quaseLotada(85), true);
  assert.equal(quaseLotada(100), true);
});

test("grupos que não chegaram não viram '0 / 0 vagas'", () => {
  // Mutante: ler a capacidade antes da carga faz uma falha em /api/groups
  // virar "sem grupos" — número inventado com cara de medição. O caso que
  // pega é o que tem capacidade REAL e carga ruim ao mesmo tempo.
  assert.deepEqual(linhaDeVagas(campanha(), "erro"), { tipo: "indisponivel" });
  assert.deepEqual(
    linhaDeVagas(campanha({ totalCapacity: 0, totalMembers: 0, groupCount: 0 }), "erro"),
    { tipo: "indisponivel" },
  );
});

test("grupos em voo são espera, não indisponibilidade", () => {
  // Mutante: fundir "carregando" com "erro" põe "Vagas indisponíveis agora"
  // em toda abertura normal da tela — o defeito que a captura de tela pegou
  // no PR #262, visto de dentro da etiqueta.
  assert.deepEqual(linhaDeVagas(campanha(), "carregando"), { tipo: "carregando" });
  assert.deepEqual(
    linhaDeVagas(campanha({ totalCapacity: 0, totalMembers: 0 }), "carregando"),
    { tipo: "carregando" },
  );
});

test("campanha sem grupo nenhum diz isso, com os grupos já carregados", () => {
  assert.deepEqual(
    linhaDeVagas(campanha({ totalCapacity: 0, totalMembers: 0, groupCount: 0, fillPct: 0 }), "ok"),
    { tipo: "sem-grupos" },
  );
});

test("grupo escolhido que sumiu não vira 'nenhum grupo escolhido'", () => {
  // Mutante: decidir "sem grupos" pela capacidade em vez da contagem. Uma
  // campanha cujos grupos saíram de /api/groups (id órfão) soma capacidade 0
  // com groupCount 3 — e a tela mandava escolher grupos que já foram
  // escolhidos. Visto na captura de tela: chip LOTOU ao lado de "Nenhum grupo
  // escolhido ainda", na mesma etiqueta.
  assert.deepEqual(
    linhaDeVagas(
      campanha({ totalCapacity: 0, totalMembers: 0, groupCount: 3, fillPct: 0, operationalStatus: "full" }),
      "ok",
    ),
    { tipo: "sem-contagem", grupos: 3 },
  );
});

test("linha de vagas formata em pt-BR e carrega o aviso de quase cheia", () => {
  const linha = linhaDeVagas(campanha(), "ok");
  assert.equal(linha.tipo, "vagas");
  if (linha.tipo !== "vagas") return;
  assert.equal(linha.texto, "475 / 2.048 vagas");
  assert.equal(linha.porcentagem, "23%");
  assert.equal(linha.quase, false);

  const cheia = linhaDeVagas(campanha({ fillPct: 92, totalMembers: 1884 }), "ok");
  assert.equal(cheia.tipo === "vagas" && cheia.quase, true);
});

test("a barra tem piso de 2% e teto de 100%", () => {
  // Mutante: sem o piso, a campanha vazia perde a barra e deixa de parecer
  // campanha; sem o teto, membros acima da capacidade estouram o trilho.
  const vazia = linhaDeVagas(campanha({ fillPct: 0, totalMembers: 0 }), "ok");
  assert.equal(vazia.tipo === "vagas" && vazia.lotacao, 0.02);

  const estourada = linhaDeVagas(campanha({ fillPct: 140, totalMembers: 2900 }), "ok");
  assert.equal(estourada.tipo === "vagas" && estourada.lotacao, 1);
});

test("cliques: singular só no 1, e nada quando a consulta não respondeu", () => {
  assert.equal(textoDeCliques(1, "ok"), "1 clique");
  assert.equal(textoDeCliques(0, "ok"), "0 cliques");
  assert.equal(textoDeCliques(2048, "ok"), "2.048 cliques");
  // Mutante: devolver "0 cliques" na falha afirma que ninguém clicou.
  assert.equal(textoDeCliques(0, "erro"), null);
  assert.equal(textoDeCliques(12, "carregando"), null);
});

test("link público só existe com slug e com origin", () => {
  assert.equal(linkPublico("https://app.girumo.com.br", "reativacao"), "https://app.girumo.com.br/r/reativacao");
  // Mutante: montar a URL sem o origin gera "/r/x" clicável que não copia nada útil.
  assert.equal(linkPublico("", "reativacao"), null);
  assert.equal(linkPublico("https://app.girumo.com.br", undefined), null);
  assert.equal(caminhoPublico("reativacao"), "/r/reativacao");
  assert.equal(caminhoPublico(undefined), null);
});

test("busca ignora acento e caixa", () => {
  const lista = [campanha(), campanha({ campaign: { id: "c2", name: "Black Friday" } })];
  assert.equal(filtrarCampanhas(lista, "all", "reativacao").length, 1);
  assert.equal(filtrarCampanhas(lista, "all", "REATIVAÇÃO").length, 1);
  assert.equal(filtrarCampanhas(lista, "all", "  black  ").length, 1);
  assert.equal(filtrarCampanhas(lista, "all", "").length, 2);
});

test("filtro e busca valem juntos, não um ou outro", () => {
  // Mutante: trocar && por || devolve toda campanha "ready" mesmo quando a
  // busca não bate — o filtro parece funcionar até alguém digitar.
  const lista = [
    campanha({ campaign: { id: "c1", name: "Reativação" }, operationalStatus: "ready" }),
    campanha({ campaign: { id: "c2", name: "Reativação antiga" }, operationalStatus: "full" }),
    campanha({ campaign: { id: "c3", name: "Black Friday" }, operationalStatus: "ready" }),
  ];
  const achadas = filtrarCampanhas(lista, "ready", "reativacao");
  assert.deepEqual(
    achadas.map((c) => c.campaign.id),
    ["c1"],
  );
});

test("ordena por lotação decrescente sem mexer no array de origem", () => {
  // Mutante: `campanhas.sort(...)` sem a cópia ordena o array do useState in
  // place — o React compara a mesma referência e pula o render.
  const lista = [
    campanha({ campaign: { id: "a", name: "A" }, fillPct: 10 }),
    campanha({ campaign: { id: "b", name: "B" }, fillPct: 90 }),
    campanha({ campaign: { id: "c", name: "C" }, fillPct: 50 }),
  ];
  const ordenada = ordenarPorLotacao(lista);
  assert.deepEqual(
    ordenada.map((c) => c.campaign.id),
    ["b", "c", "a"],
  );
  assert.deepEqual(
    lista.map((c) => c.campaign.id),
    ["a", "b", "c"],
  );
});

test("empate de lotação cai no nome, não na ordem da API", () => {
  const lista = [
    campanha({ campaign: { id: "z", name: "Zebra" }, fillPct: 40 }),
    campanha({ campaign: { id: "a", name: "Álamo" }, fillPct: 40 }),
    campanha({ campaign: { id: "m", name: "Meio" }, fillPct: 40 }),
  ];
  assert.deepEqual(
    ordenarPorLotacao(lista).map((c) => c.campaign.id),
    ["a", "m", "z"],
  );
});

test("contagem por filtro: 'all' é o total e cada estado soma o seu", () => {
  const lista = [
    campanha({ operationalStatus: "ready" }),
    campanha({ operationalStatus: "ready" }),
    campanha({ operationalStatus: "full" }),
    campanha({ operationalStatus: "empty" }),
  ];
  assert.deepEqual(contarPorFiltro(lista), {
    all: 4,
    ready: 2,
    needs_invites: 0,
    full: 1,
    empty: 1,
  });
  // Mutante: iniciar as contas sem as chaves zeradas devolve `undefined` na
  // aba vazia, e "Sem convite" perde o número.
  assert.equal(contarPorFiltro([]).needs_invites, 0);
});
