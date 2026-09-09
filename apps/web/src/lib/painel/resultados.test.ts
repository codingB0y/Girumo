import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cenaDosResultados,
  conversaoCliqueEntrada,
  dinheiroOuNada,
  funilDaVenda,
  houveFalha,
  membrosPorCampanha,
  numeroOuNada,
  vendasPorCampanha,
  vendasPorGrupo,
} from "./resultados";

test("uma consulta lenta não segura as outras quatro reféns", () => {
  // Mutante: usar `some` no lugar de `every`. Com cinco rotas, basta uma
  // demorar para o quadro inteiro virar esqueleto — e uma falhar para o
  // quadro inteiro virar erro, escondendo quatro medições boas.
  assert.equal(cenaDosResultados(["carregando", "ok", "ok", "ok", "ok"]), "quadro");
  assert.equal(cenaDosResultados(["erro", "ok", "ok", "ok", "ok"]), "quadro");
  assert.equal(cenaDosResultados(["erro", "carregando", "ok", "ok", "ok"]), "quadro");
});

test("esqueleto só com nada em mãos; erro só quando nada deu certo", () => {
  assert.equal(cenaDosResultados(["carregando", "carregando"]), "carregando");
  assert.equal(cenaDosResultados(["erro", "erro"]), "erro");
  // Erro + carregando ainda não é erro definitivo: falta uma resposta.
  assert.equal(cenaDosResultados(["erro", "carregando"]), "quadro");
  assert.equal(cenaDosResultados([]), "carregando");
});

test("falha em qualquer consulta acende o aviso", () => {
  assert.equal(houveFalha(["ok", "ok", "erro"]), true);
  assert.equal(houveFalha(["ok", "carregando"]), false);
  assert.equal(houveFalha([]), false);
});

test("consulta que não respondeu não imprime zero", () => {
  // Mutante: devolver o valor sem olhar a carga. Era o defeito da casca
  // antiga — cinco `.catch(() => [])` faziam uma falha em /api/orders
  // escrever "R$ 0,00" em "Vendas desde o início", com cara de caixa fechado.
  assert.equal(numeroOuNada(0, "erro"), null);
  assert.equal(numeroOuNada(1234, "carregando"), null);
  assert.equal(numeroOuNada(1234, "ok"), "1.234");
  assert.equal(dinheiroOuNada(0, "erro"), null);
  // `\s` e não " ": o Intl separa "R$" do número com espaço não-quebrável
  // (U+00A0), e comparar com literal de espaço comum falha sem mostrar por quê.
  assert.match(dinheiroOuNada(0, "ok") ?? "", /^R\$\s0,00$/);
  assert.match(dinheiroOuNada(1234.5, "ok") ?? "", /^R\$\s1\.234,50$/);
});

test("sem clique não existe taxa de conversão", () => {
  // Mutante: manter o `: 0` da casca antiga acusa de 0% quem ainda não teve
  // um visitante sequer.
  assert.equal(conversaoCliqueEntrada(0, 0, "ok"), null);
  assert.equal(conversaoCliqueEntrada(5, 0, "ok"), null);
  assert.equal(conversaoCliqueEntrada(25, 100, "ok"), "25%");
  assert.equal(conversaoCliqueEntrada(25, 100, "erro"), null);
});

test("funil mede tudo contra os cliques e mostra o passo a passo", () => {
  const passos = funilDaVenda({ cliques: 200, entradas: 50, pedidos: 10 });
  assert.deepEqual(
    passos.map((p) => [p.rotulo, p.valor, p.doPassoAnterior]),
    [
      ["Clicaram no link", 200, null],
      ["Entraram no grupo", 50, "25% do passo"],
      ["Viraram pedidos", 10, "20% do passo"],
    ],
  );
  assert.equal(passos[0].largura, 1);
  assert.equal(passos[1].largura, 0.25);
});

test("funil sem clique nenhum não desenha barra cheia embaixo de um zero", () => {
  // Mutante: fixar 100% no primeiro passo, como fazia a casca antiga.
  const passos = funilDaVenda({ cliques: 0, entradas: 0, pedidos: 0 });
  assert.deepEqual(passos.map((p) => p.largura), [0.04, 0.04, 0.04]);
  assert.deepEqual(passos.map((p) => p.doPassoAnterior), [null, null, null]);
});

test("passo maior que o anterior não estoura o trilho", () => {
  // Pedido pode chegar sem clique registrado; a barra para no cheio.
  const passos = funilDaVenda({ cliques: 10, entradas: 40, pedidos: 2 });
  assert.equal(passos[1].largura, 1);
  assert.equal(passos[1].doPassoAnterior, "400% do passo");
});

test("venda sem grupo vira 'Sem grupo' em vez de sumir da soma", () => {
  const fatias = vendasPorGrupo([
    { value: 100, group_name: "VIP 1" },
    { value: 50, group_name: "   " },
    { value: 25, group_name: null },
    { value: 300, group_name: "VIP 2" },
  ]);
  assert.deepEqual(
    fatias.map((f) => [f.nome, f.total]),
    [
      ["VIP 2", 300],
      ["VIP 1", 100],
      ["Sem grupo", 75],
    ],
  );
  assert.equal(fatias[0].largura, 1);
});

test("venda casa com a campanha por ID, nunca por nome", () => {
  // Mutante: casar por `campaign_id` contra o NOME ressuscitaria o bug que
  // links/click-attribution.ts já pagou pra corrigir — renomear a campanha
  // zerava o histórico dela.
  const campanhas = [
    { id: "c1", name: "Reativação", groupIds: [] },
    { id: "c2", name: "Black Friday", groupIds: [] },
  ];
  const fatias = vendasPorCampanha(
    [
      { value: 100, campaign_id: "c1" },
      { value: 400, campaign_id: "c2" },
      { value: 30, campaign_id: "apagada" },
      { value: 20, campaign_id: null },
    ],
    campanhas,
  );
  assert.deepEqual(
    fatias.map((f) => [f.nome, f.total]),
    [
      ["Black Friday", 400],
      ["Reativação", 100],
      ["Sem origem", 50],
    ],
  );
});

test("sem pedido nenhum a lista sai vazia, não com uma fatia de zero", () => {
  assert.deepEqual(vendasPorGrupo([]), []);
  assert.deepEqual(vendasPorCampanha([], []), []);
});

test("membros por campanha: top 5, do maior para o menor", () => {
  const grupos = [
    { id: "g1", name: "VIP 1", whatsappGroupId: "w1", members: 900, capacity: 1024 },
    { id: "g2", name: "VIP 2", whatsappGroupId: "w2", members: 100, capacity: 1024 },
    { id: "g3", name: "VIP 3", whatsappGroupId: "w3", members: 500, capacity: 1024 },
  ];
  const campanhas = [
    { id: "a", name: "A", groupIds: ["g1"] },
    { id: "b", name: "B", groupIds: ["g2"] },
    { id: "c", name: "C", groupIds: ["g2", "g3"] },
  ];
  const fatias = membrosPorCampanha(campanhas, grupos);
  assert.deepEqual(
    fatias.map((f) => [f.nome, f.total]),
    [
      ["A", 900],
      ["C", 600],
      ["B", 100],
    ],
  );
  assert.equal(fatias[0].largura, 1);
});

test("campanha que não juntou ninguém fica fora do ranking", () => {
  // Mutante: soltar o filtro devolve a lista com zeros. Visto na captura de
  // tela: uma campanha real e quatro linhas de "0", cada uma com barrinha de
  // 2% — ruído com aparência de medição, numa lista que promete ranking.
  const grupos = [{ id: "g1", name: "VIP", whatsappGroupId: "w1", members: 900, capacity: 1024 }];
  const fatias = membrosPorCampanha(
    [
      { id: "a", name: "Com gente", groupIds: ["g1"] },
      { id: "b", name: "Vazia", groupIds: [] },
      { id: "c", name: "Órfã", groupIds: ["sumiu"] },
    ],
    grupos,
  );
  assert.deepEqual(
    fatias.map((f) => f.nome),
    ["Com gente"],
  );
  // Nenhuma juntou ninguém: lista vazia, não cinco zeros.
  assert.deepEqual(membrosPorCampanha([{ id: "b", name: "Vazia", groupIds: [] }], grupos), []);
});

test("campanha casa o grupo pelo id do WhatsApp, não só pelo UUID", () => {
  // Mutante: casar só por `id`. Em produção o groupIds guarda o id do
  // WhatsApp, e a tela mostraria zero membro para toda campanha real.
  const grupos = [{ id: "uuid-1", name: "VIP", whatsappGroupId: "123@g.us", members: 700, capacity: 1024 }];
  const fatias = membrosPorCampanha([{ id: "a", name: "A", groupIds: ["123@g.us"] }], grupos);
  assert.deepEqual(fatias.map((f) => f.total), [700]);
});

test("o limite corta em 5 depois de ordenar, não antes", () => {
  // Mutante: cortar antes de ordenar mostra as 5 primeiras da API em vez das
  // 5 maiores — a tela promete "as que mais juntaram gente".
  const grupos = Array.from({ length: 7 }, (_, i) => ({
    id: `g${i}`,
    name: `VIP ${i}`,
    whatsappGroupId: `w${i}`,
    members: (i + 1) * 10,
    capacity: 1024,
  }));
  const campanhas = grupos.map((g, i) => ({ id: `c${i}`, name: `C${i}`, groupIds: [g.id] }));
  const fatias = membrosPorCampanha(campanhas, grupos);
  assert.equal(fatias.length, 5);
  assert.deepEqual(fatias.map((f) => f.total), [70, 60, 50, 40, 30]);
});
