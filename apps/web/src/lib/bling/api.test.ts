import assert from "node:assert/strict";
import { test } from "node:test";

import {
  diaDoBling,
  horaDoBling,
  listarPedidos,
  listarSituacoesDeVenda,
  obterContato,
  obterEmpresa,
  obterPedido,
  type ContatoBling,
  type PedidoResumo,
} from "./api";
import { ErroBling, type ClienteBling, type Query } from "./cliente";

type Chamada = { caminho: string; query: Record<string, unknown>; prazo?: number };

/** Cliente falso: devolve (ou lança) o que estiver na fila, na ordem. */
function clienteFalso(respostas: unknown[]) {
  const chamadas: Chamada[] = [];
  const cliente: ClienteBling = {
    async get(caminho: string, query?: Query, prazo?: number) {
      const definidos = Object.entries(query ?? {}).filter(([, v]) => v !== undefined);
      chamadas.push({ caminho, query: Object.fromEntries(definidos), ...(prazo === undefined ? {} : { prazo }) });
      if (respostas.length === 0) throw new Error(`cliente falso: sem resposta para ${caminho}`);
      const r = respostas.shift();
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { cliente, chamadas };
}

const PEDIDO = {
  id: 12345678,
  numero: 123,
  numeroLoja: "",
  data: "2026-10-13",
  dataSaida: "2026-10-13",
  dataPrevista: "0000-00-00",
  totalProdutos: 150,
  total: 150.5,
  contato: { id: 987, nome: "Maria", tipoPessoa: "F", numeroDocumento: "123" },
  situacao: { id: 9, valor: 1 },
  loja: { id: 0 },
};

const RESUMO: PedidoResumo = { id: 12345678, numero: "123", data: "2026-10-13", total: 150.5, contatoId: 987, situacaoId: 9, lojaId: null };

const ehInvalido = (e: unknown) => e instanceof ErroBling && e.tipo === "invalido";

test("listarPedidos: /pedidos/vendas com página, limite 100 e só os filtros dados", async () => {
  const { cliente, chamadas } = clienteFalso([{ data: [PEDIDO] }, { data: [] }]);
  assert.deepEqual(
    await listarPedidos(cliente, { pagina: 1, dataAlteracaoInicial: "2026-10-13 06:00:00", dataAlteracaoFinal: "2026-10-13 10:00:00" }),
    { pedidos: [RESUMO], brutos: 1, descartados: [] },
  );
  assert.deepEqual(chamadas[0], {
    caminho: "/pedidos/vendas",
    query: { pagina: 1, limite: 100, dataAlteracaoInicial: "2026-10-13 06:00:00", dataAlteracaoFinal: "2026-10-13 10:00:00" },
  });
  assert.deepEqual(await listarPedidos(cliente, { pagina: 3, limite: 50, dataInicial: "2026-07-15", dataFinal: "2026-10-13" }), { pedidos: [], brutos: 0, descartados: [] });
  assert.deepEqual(chamadas[1].query, { pagina: 3, limite: 50, dataInicial: "2026-07-15", dataFinal: "2026-10-13" });
});

test("listarPedidos repassa ao cliente o prazo da página (a varredura para nele sem contar erro)", async () => {
  const { cliente, chamadas } = clienteFalso([{ data: [] }]);
  await listarPedidos(cliente, { pagina: 1 }, 1_234_567);
  assert.equal(chamadas[0].prazo, 1_234_567);
});

test("listarPedidos normaliza: número vira texto, data zerada, vazia ou antes de 2000 vira null, total em texto vira número, contato 0 vira null", async () => {
  const itens = [
    { ...PEDIDO, id: 1, numero: "", data: "0000-00-00", total: "99.90", contato: { id: 0 } },
    { ...PEDIDO, id: 2, numero: " 77 ", data: "", contato: undefined },
    { ...PEDIDO, id: 3, data: "2026-02-30", numero: { estranho: true } },
    { ...PEDIDO, id: "4", data: "2026-10-13 15:42:10", total: 0 },
    { ...PEDIDO, id: 5, total: -10, campoNovo: { qualquer: 1 } },
    { ...PEDIDO, id: 6, data: "1999-12-31" },
    { ...PEDIDO, id: 7, data: "0001-01-01" },
    { ...PEDIDO, id: 8, data: "1970-01-01" },
    { ...PEDIDO, id: 9, data: "2000-01-01" },
  ];
  const { cliente } = clienteFalso([{ data: itens }]);
  const resumo = { numero: "123", total: 150.5, contatoId: 987, situacaoId: 9, lojaId: null };
  assert.deepEqual(await listarPedidos(cliente, { pagina: 1 }), {
    pedidos: [
      { id: 1, numero: null, data: null, total: 99.9, contatoId: null, situacaoId: 9, lojaId: null },
      { id: 2, numero: "77", data: null, total: 150.5, contatoId: null, situacaoId: 9, lojaId: null },
      { id: 3, numero: null, data: null, total: 150.5, contatoId: 987, situacaoId: 9, lojaId: null },
      { id: 4, numero: "123", data: "2026-10-13", total: 0, contatoId: 987, situacaoId: 9, lojaId: null },
      { id: 5, numero: "123", data: "2026-10-13", total: -10, contatoId: 987, situacaoId: 9, lojaId: null },
      { ...resumo, id: 6, data: null },
      { ...resumo, id: 7, data: null },
      { ...resumo, id: 8, data: null },
      { ...resumo, id: 9, data: "2000-01-01" },
    ],
    brutos: 9,
    descartados: [],
  });
});

test("listarPedidos: canal de venda = loja.id positivo (número ou texto); 0, ausente ou torto vira null", async () => {
  const itens = [
    { ...PEDIDO, id: 1, loja: { id: 204937216, unidadeNegocio: { id: 0 } } },
    { ...PEDIDO, id: 2, loja: { id: "205291049" } },
    { ...PEDIDO, id: 3, loja: { id: 0 } },
    { ...PEDIDO, id: 4, loja: undefined },
    { ...PEDIDO, id: 5, loja: "yampi" },
    { ...PEDIDO, id: 6, loja: { id: -3 } },
  ];
  const { cliente } = clienteFalso([{ data: itens }]);
  const { pedidos } = await listarPedidos(cliente, { pagina: 1 });
  assert.deepEqual(
    pedidos.map((p) => [p.id, p.lojaId]),
    [[1, 204937216], [2, 205291049], [3, null], [4, null], [5, null], [6, null]],
  );
});

test("obterPedido traz o canal de venda do detalhe", async () => {
  const { cliente } = clienteFalso([{ data: { ...PEDIDO, loja: { id: 204937216 } } }]);
  assert.deepEqual(await obterPedido(cliente, 12345678), { ...RESUMO, lojaId: 204937216 });
});

test("listarPedidos: página só com itens tortos tem brutos > 0 (não é o fim da paginação)", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const { cliente } = clienteFalso([{ data: [null, { ...PEDIDO, id: 0 }, "x"] }]);
  assert.deepEqual(await listarPedidos(cliente, { pagina: 4 }), { pedidos: [], brutos: 3, descartados: [] });
});

test("listarPedidos descarta item sem id positivo, sem situação ou com total que não é número — e só ele", async (t) => {
  const avisos: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => avisos.push(args.map(String).join(" ")));
  const itens = [
    { ...PEDIDO, id: undefined },
    { ...PEDIDO, id: 0 },
    { ...PEDIDO, id: -3 },
    { ...PEDIDO, id: 1.5 },
    { ...PEDIDO, id: "12a" },
    { ...PEDIDO, id: 501, situacao: undefined },
    { ...PEDIDO, id: 502, situacao: { id: 0 } },
    { ...PEDIDO, id: 503, situacao: "9" },
    { ...PEDIDO, id: 504, total: "abc" },
    { ...PEDIDO, id: 505, total: "150,50" },
    { ...PEDIDO, id: 506, total: "" },
    { ...PEDIDO, id: 507, total: undefined },
    { ...PEDIDO, id: " 508 ", total: null },
    null,
    "texto",
    42,
    PEDIDO,
  ];
  const { cliente } = clienteFalso([{ data: itens }]);
  // Do torto com id legível sai o id (o motor o põe na fila pelo aviso, que busca o pedido inteiro);
  // o sem id só conta em `brutos`.
  assert.deepEqual(await listarPedidos(cliente, { pagina: 1 }), {
    pedidos: [RESUMO],
    brutos: 17,
    descartados: [501, 502, 503, 504, 505, 506, 507, 508],
  });
  // Quem loga é o motor, com a loja (a api não sabe de qual é).
  assert.deepEqual(avisos, []);
});

test("listarPedidos: resposta fora do envelope { data: [...] } → invalido", async () => {
  for (const ruim of [{}, { data: {} }, { data: null }, null, [PEDIDO], "x"]) {
    const { cliente } = clienteFalso([ruim]);
    await assert.rejects(listarPedidos(cliente, { pagina: 1 }), ehInvalido, JSON.stringify(ruim));
  }
});

test("obterPedido: GET /pedidos/vendas/{id} normalizado; 404 → null; outros erros sobem", async () => {
  const { cliente, chamadas } = clienteFalso([{ data: { ...PEDIDO, itens: [{ id: 1 }], parcelas: [], vendedor: { id: 0 }, observacoes: "x" } }]);
  assert.deepEqual(await obterPedido(cliente, 12345678), RESUMO);
  assert.equal(chamadas[0].caminho, "/pedidos/vendas/12345678");
  assert.equal(await obterPedido(clienteFalso([new ErroBling("nao_encontrado", 404, "x")]).cliente, 1), null);
  const limite = new ErroBling("limite", 429, "limite");
  await assert.rejects(obterPedido(clienteFalso([limite]).cliente, 1), (e: unknown) => e === limite);
});

test("obterPedido com total que não é número, sem situação ou fora do envelope → invalido", async () => {
  for (const ruim of [{ data: { ...PEDIDO, total: "abc" } }, { data: { ...PEDIDO, situacao: null } }, { data: null }, {}, null]) {
    const { cliente } = clienteFalso([ruim]);
    await assert.rejects(obterPedido(cliente, 12345678), ehInvalido, JSON.stringify(ruim));
  }
});

test("obterPedido: id do corpo diferente do pedido → invalido; sem id no corpo, vale o pedido", async () => {
  for (const outro of [999, "999"]) {
    const { cliente } = clienteFalso([{ data: { ...PEDIDO, id: outro } }]);
    await assert.rejects(obterPedido(cliente, 12345678), ehInvalido, String(outro));
  }
  const { cliente } = clienteFalso([{ data: { ...PEDIDO, id: undefined } }, { data: { ...PEDIDO, id: "12345678" } }]);
  assert.deepEqual(await obterPedido(cliente, 12345678), RESUMO);
  assert.deepEqual(await obterPedido(cliente, 12345678), RESUMO);
});

const CONTATO = {
  id: 987,
  nome: "Maria Souza",
  codigo: "",
  situacao: "A",
  numeroDocumento: "123",
  telefone: "(62) 3333-4444",
  celular: "(62) 99999-8888",
  fantasia: "",
  tipo: "F",
  email: "maria@x.com",
  emailNotaFiscal: "",
  endereco: {
    geral: { endereco: "Rua A", cep: "74000-000", bairro: "Centro", municipio: "Goiânia", uf: "GO", numero: "1", complemento: "" },
    cobranca: { cep: "00000-000" },
  },
  vendedor: { id: 0 },
  dadosAdicionais: { dataNascimento: "1990-08-24", sexo: "F", naturalidade: "" },
  pais: { nome: "Brasil" },
};

const CONTATO_NORMALIZADO: ContatoBling = {
  id: 987,
  nome: "Maria Souza",
  tipo: "F",
  celular: "(62) 99999-8888",
  telefone: "(62) 3333-4444",
  email: "maria@x.com",
  emailNotaFiscal: null,
  municipio: "Goiânia",
  uf: "GO",
  cep: "74000-000",
  pais: "Brasil",
  dataNascimento: "1990-08-24",
  sexo: "F",
};

test("obterContato: GET /contatos/{id} com endereço geral, dados adicionais e país; vazio vira null", async () => {
  const { cliente, chamadas } = clienteFalso([{ data: CONTATO }]);
  assert.deepEqual(await obterContato(cliente, 987), CONTATO_NORMALIZADO);
  assert.equal(chamadas[0].caminho, "/contatos/987");
});

test("obterContato tolera campo faltando ou estranho: vira null, o resto fica", async () => {
  const torto = {
    ...CONTATO,
    nome: "  ",
    tipo: "j",
    celular: 62999998888,
    email: "",
    endereco: { geral: null },
    dadosAdicionais: { dataNascimento: "0000-00-00", sexo: "X" },
    pais: undefined,
  };
  const semNada = { id: 987 };
  const { cliente } = clienteFalso([{ data: torto }, { data: semNada }, { data: { ...CONTATO, id: undefined, tipo: "Z", dadosAdicionais: { dataNascimento: "", sexo: "m" } } }]);
  const vazios = { municipio: null, uf: null, cep: null, pais: null, dataNascimento: null, sexo: null };
  assert.deepEqual(await obterContato(cliente, 987), { ...CONTATO_NORMALIZADO, ...vazios, nome: null, tipo: "J", celular: "62999998888", email: null });
  const tudoNull = Object.fromEntries(Object.keys(CONTATO_NORMALIZADO).map((k) => [k, null]));
  assert.deepEqual(await obterContato(cliente, 987), { ...tudoNull, id: 987 });
  const terceiro = await obterContato(cliente, 987);
  assert.equal(terceiro?.id, 987);
  assert.equal(terceiro?.tipo, null);
  assert.equal(terceiro?.dataNascimento, null);
  assert.equal(terceiro?.sexo, "M");
});

test("obterContato: id do corpo diferente do pedido → invalido; o id devolvido é sempre o pedido", async () => {
  const { cliente } = clienteFalso([{ data: { ...CONTATO, id: 555 } }, { data: { ...CONTATO, id: "987" } }]);
  await assert.rejects(obterContato(cliente, 987), ehInvalido);
  assert.deepEqual(await obterContato(cliente, 987), CONTATO_NORMALIZADO);
});

test("nascimento do contato: de 1900 em diante (o piso de 2000 é só da data do pedido)", async () => {
  const nascimento = async (dataNascimento: string) => {
    const { cliente } = clienteFalso([{ data: { ...CONTATO, dadosAdicionais: { dataNascimento, sexo: "F" } } }]);
    return (await obterContato(cliente, 987))?.dataNascimento;
  };
  assert.equal(await nascimento("1900-01-01"), "1900-01-01");
  assert.equal(await nascimento("1975-03-09"), "1975-03-09");
  assert.equal(await nascimento("1899-12-31"), null);
  assert.equal(await nascimento("0100-01-01"), null);
});

test("obterContato: 404 → null; fora do envelope → invalido", async () => {
  const naoAchou = clienteFalso([new ErroBling("nao_encontrado", 404, "x")]);
  assert.equal(await obterContato(naoAchou.cliente, 1), null);
  for (const ruim of [{ data: null }, { data: "x" }, {}]) {
    const { cliente } = clienteFalso([ruim]);
    await assert.rejects(obterContato(cliente, 1), ehInvalido);
  }
});

test("obterEmpresa: id texto não vazio; nome = nome ?? razaoSocial ?? fantasia ?? null", async () => {
  const { cliente, chamadas } = clienteFalso([
    { data: { id: "d4475854366a36c86a37e792f9634a51", nome: "Loja X Ltda", razaoSocial: "R" } },
    { data: { id: "abc", nome: "", razaoSocial: "Razão Y", fantasia: "F" } },
    { data: { id: "abc", fantasia: "Fantasia Z" } },
    { data: { id: "abc" } },
  ]);
  assert.deepEqual(await obterEmpresa(cliente), { id: "d4475854366a36c86a37e792f9634a51", nome: "Loja X Ltda" });
  assert.equal(chamadas[0].caminho, "/empresas/me/dados-basicos");
  assert.deepEqual(await obterEmpresa(cliente), { id: "abc", nome: "Razão Y" });
  assert.deepEqual(await obterEmpresa(cliente), { id: "abc", nome: "Fantasia Z" });
  assert.deepEqual(await obterEmpresa(cliente), { id: "abc", nome: null });
});

test("obterEmpresa sem id em texto → invalido", async () => {
  for (const ruim of [{ data: { nome: "X" } }, { data: { id: "" } }, { data: { id: "  " } }, { data: { id: 123 } }, { data: null }, {}]) {
    const { cliente } = clienteFalso([ruim]);
    await assert.rejects(obterEmpresa(cliente), ehInvalido, JSON.stringify(ruim));
  }
});

const SITUACOES = [
  { id: 6, nome: "Em aberto", idHerdado: 0, cor: "#E9DC40" },
  { id: 9, nome: "Atendido", idHerdado: 0 },
  { id: 31337, nome: "Pago", idHerdado: 9 },
  { id: 40, nome: "", idHerdado: 12 },
  { id: 0, nome: "Sem id" },
  { nome: "Também sem id" },
  null,
];

test("listarSituacoesDeVenda: acha o módulo Vendas (não o PDV) e devolve id, nome e base", async () => {
  const { cliente, chamadas } = clienteFalso([
    {
      data: [
        { id: 98311, nome: "PDV", descricao: "x", criarSituacoes: true },
        { id: 98310, nome: "Vendas", descricao: "y", criarSituacoes: true },
      ],
    },
    { data: SITUACOES },
  ]);
  assert.deepEqual(await listarSituacoesDeVenda(cliente), [
    { id: 6, nome: "Em aberto", base: 6 },
    { id: 9, nome: "Atendido", base: 9 },
    { id: 31337, nome: "Pago", base: 9 },
    { id: 40, nome: "Situação 40", base: 12 },
  ]);
  assert.deepEqual(chamadas.map((c) => c.caminho), ["/situacoes/modulos", "/situacoes/modulos/98310"]);
});

async function moduloEscolhido(nomes: string[]): Promise<string | null> {
  const modulos = nomes.map((nome, i) => ({ id: i + 1, nome }));
  const { cliente, chamadas } = clienteFalso([{ data: modulos }, { data: [{ id: 9, nome: "Atendido", idHerdado: 0 }] }]);
  const situacoes = await listarSituacoesDeVenda(cliente);
  if (situacoes === null) {
    assert.equal(chamadas.length, 1);
    return null;
  }
  const id = Number(chamadas[1].caminho.split("/").pop());
  return nomes[id - 1];
}

test("módulo de vendas: nome exato (sem acento nem caixa) vence; senão o que contém venda sem pdv/proposta/devolução", async () => {
  assert.equal(await moduloEscolhido(["Notas de venda", "Vendas"]), "Vendas");
  assert.equal(await moduloEscolhido(["Propostas comerciais", " PEDIDOS DE VENDA "]), " PEDIDOS DE VENDA ");
  assert.equal(await moduloEscolhido(["Pedidos  de  Vendas", "Vendas online"]), "Pedidos  de  Vendas");
  assert.equal(await moduloEscolhido(["Vendas PDV", "Propostas de venda", "Devoluções de venda", "Vendas da loja"]), "Vendas da loja");
  assert.equal(await moduloEscolhido(["Vendas PDV", "Propostas de venda", "Devoluções de venda"]), null);
  assert.equal(await moduloEscolhido(["Compras", "Ordens de serviço"]), null);
  assert.equal(await moduloEscolhido([]), null);
});

test("listarSituacoesDeVenda: módulo sem nenhuma situação válida → null (quem chama cai no padrão)", async () => {
  const { cliente } = clienteFalso([{ data: [{ id: 1, nome: "Vendas" }] }, { data: [{ id: 0 }, null] }]);
  assert.equal(await listarSituacoesDeVenda(cliente), null);
});

test("listarSituacoesDeVenda: resposta fora do envelope → invalido", async () => {
  const { cliente } = clienteFalso([{ data: {} }]);
  await assert.rejects(listarSituacoesDeVenda(cliente), ehInvalido);
});

test("horaDoBling e diaDoBling em São Paulo (UTC−3), com meia-noite em 00", () => {
  assert.equal(horaDoBling(new Date("2026-10-13T03:00:00Z")), "2026-10-13 00:00:00");
  assert.equal(horaDoBling(new Date("2026-10-13T02:59:59Z")), "2026-10-12 23:59:59");
  assert.equal(horaDoBling(new Date("2026-01-05T15:04:05.999Z")), "2026-01-05 12:04:05");
  assert.equal(diaDoBling(new Date("2026-10-13T03:00:00Z")), "2026-10-13");
  assert.equal(diaDoBling(new Date("2026-10-13T02:59:59Z")), "2026-10-12");
  assert.equal(diaDoBling(new Date("2026-12-31T23:30:00Z")), "2026-12-31");
});
