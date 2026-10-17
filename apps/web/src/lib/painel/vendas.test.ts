import test from "node:test";
import assert from "node:assert/strict";

import {
  ERRO_LINHA_INCOMPLETA,
  ERRO_MUITOS_ITENS,
  ERRO_TOTAL_ALTO,
  ERRO_TOTAL_ZERO,
  LINHA_VAZIA,
  MAX_ITENS,
  linhasDaVenda,
  mensagemDeErro,
  nomeDoCliente,
  nomeDoMes,
  nomesDeProdutos,
  pecasDasLinhas,
  quandoFoi,
  resumoDosItens,
  rotuloDePecas,
  rotuloDeVendas,
  subtotalDaLinha,
  totalDasLinhas,
  totalDosItens,
  validarLinhas,
  vendaDaResposta,
  type LinhaDaVenda,
} from "./vendas";
import type { VendaDoMes } from "@/lib/vendas/tipos";

const linha = (nome: string, quantidade: string, valor: string): LinhaDaVenda => ({ nome, quantidade, valor });

test("subtotal e total somam em centavos, com vírgula ou ponto decimal", () => {
  assert.equal(subtotalDaLinha(linha("Vestido midi", "2", "119,90")), 239.8);
  assert.equal(totalDasLinhas([linha("Vestido midi", "2", "119,90"), linha("Cropped", "1", "49.90")]), 289.7);
  // 3 × 0,10 em float é 0,30000000000000004: a tela não pode mostrar isso.
  assert.equal(totalDasLinhas([linha("Grampo", "3", "0,10")]), 0.3);
  assert.equal(totalDasLinhas([linha("Casaco", "1", "1.149,90")]), 1149.9);
});

test("linha incompleta vale zero e não quebra o total", () => {
  assert.equal(subtotalDaLinha(LINHA_VAZIA), 0);
  assert.equal(subtotalDaLinha(linha("Vestido", "", "10")), 0);
  assert.equal(totalDasLinhas([linha("Vestido", "2", "119,90"), linha("", "1", "")]), 239.8);
});

test("peças: soma só quantidade válida, com o plural certo", () => {
  assert.equal(pecasDasLinhas([linha("A", "2", "1"), linha("B", "3", "1"), linha("C", "", "1")]), 5);
  assert.equal(rotuloDePecas(1), "1 peça");
  assert.equal(rotuloDePecas(0), "0 peças");
  assert.equal(rotuloDePecas(5), "5 peças");
});

test("validarLinhas devolve os itens do POST, nome aparado e valor no centavo", () => {
  assert.deepEqual(validarLinhas([linha("  Vestido midi  ", "2", "119,90"), linha("Brinde", "1", "0")]), {
    ok: true,
    itens: [
      { nome: "Vestido midi", quantidade: 2, valorUnitario: 119.9 },
      { nome: "Brinde", quantidade: 1, valorUnitario: 0 },
    ],
  });
  // numeric(12,2) no banco: o que a tela soma tem que ser o que o banco grava.
  assert.deepEqual(validarLinhas([linha("Meia", "1", "19,999")]), {
    ok: true,
    itens: [{ nome: "Meia", quantidade: 1, valorUnitario: 20 }],
  });
});

test("validarLinhas recusa linha incompleta ou fora do limite, total zero e mais de 50 produtos", () => {
  const incompleta = { ok: false, erro: ERRO_LINHA_INCOMPLETA };
  assert.deepEqual(validarLinhas([]), incompleta);
  assert.deepEqual(validarLinhas([linha("", "1", "10")]), incompleta);
  assert.deepEqual(validarLinhas([linha("Vestido", "0", "10")]), incompleta);
  assert.deepEqual(validarLinhas([linha("Vestido", "1", "")]), incompleta);
  assert.deepEqual(validarLinhas([linha("Vestido", "10000", "10")]), incompleta);
  assert.deepEqual(validarLinhas([linha("Vestido", "1", "1000000")]), incompleta);
  assert.deepEqual(validarLinhas([linha("x".repeat(121), "1", "10")]), incompleta);
  assert.deepEqual(validarLinhas([linha("Brinde", "1", "0,00")]), { ok: false, erro: ERRO_TOTAL_ZERO });
  const demais = Array.from({ length: MAX_ITENS + 1 }, () => linha("Meia", "1", "5"));
  assert.deepEqual(validarLinhas(demais), { ok: false, erro: ERRO_MUITOS_ITENS });
});

test("resumo da venda como a lista mostra; pedido antigo diz que não tem itens", () => {
  assert.equal(
    resumoDosItens([
      { nome: "Conjunto alfaiataria", quantidade: 1, valorUnitario: 187.8 },
      { nome: "Blusa bufante", quantidade: 2, valorUnitario: 49.95 },
    ]),
    "Conjunto alfaiataria ×1 · Blusa bufante ×2",
  );
  assert.equal(resumoDosItens([]), "Pedido sem itens");
});

test("corrigir reabre os itens no formulário, e eles validam de volta iguais", () => {
  const itens = [
    { nome: "Vestido midi", quantidade: 2, valorUnitario: 119.9 },
    { nome: "Brinde", quantidade: 1, valorUnitario: 0 },
  ];
  const linhas = linhasDaVenda({ itens });
  assert.deepEqual(linhas, [linha("Vestido midi", "2", "119,90"), linha("Brinde", "1", "0,00")]);
  assert.deepEqual(validarLinhas(linhas), { ok: true, itens });
  assert.deepEqual(linhasDaVenda({ itens: [] }), [LINHA_VAZIA]);
});

test("nome do cliente: o nome, senão o número formatado, senão 'Cliente sem nome'", () => {
  assert.equal(nomeDoCliente({ cliente: "Fernanda Lima", telefone: "5511987654321" }), "Fernanda Lima");
  assert.equal(nomeDoCliente({ cliente: null, telefone: "5511987654321" }), "+55 11 98765-4321");
  assert.equal(nomeDoCliente({ cliente: "  ", telefone: "" }), "Cliente sem nome");
});

test("quandoFoi fala hoje, ontem ou a data, no fuso de Brasília", () => {
  const agora = new Date("2026-10-07T15:00:00Z"); // 12:00 em Brasília
  assert.equal(quandoFoi("2026-10-07T14:08:00Z", agora), "hoje 11:08");
  assert.equal(quandoFoi("2026-10-06T20:42:00Z", agora), "ontem 17:42");
  assert.equal(quandoFoi("2026-10-03T18:20:00Z", agora), "03/10 15:20");
  // 02:30 UTC de 07/10 ainda é 23:30 de 06/10 em Brasília.
  assert.equal(quandoFoi("2026-10-07T02:30:00Z", agora), "ontem 23:30");
  assert.equal(quandoFoi("lixo", agora), "");
});

test("nome do mês a partir de YYYY-MM; lixo vira vazio", () => {
  assert.equal(nomeDoMes("2026-10"), "outubro");
  assert.equal(nomeDoMes("2026-01"), "janeiro");
  assert.equal(nomeDoMes("2026-13"), "");
  assert.equal(nomeDoMes("outubro"), "");
});

test("contagem de vendas com o singular certo e sem zero seco", () => {
  assert.equal(rotuloDeVendas(0), "nenhuma venda");
  assert.equal(rotuloDeVendas(1), "1 venda");
  assert.equal(rotuloDeVendas(4), "4 vendas");
});

test("datalist: nomes usados no mês, sem repetir (caixa e espaço), o mais recente primeiro", () => {
  const vendas = [
    { itens: [{ nome: "Cropped tricô", quantidade: 1, valorUnitario: 49.9 }, { nome: "Vestido midi", quantidade: 1, valorUnitario: 119.9 }] },
    { itens: [{ nome: "vestido midi ", quantidade: 2, valorUnitario: 119.9 }, { nome: "Calça wide leg", quantidade: 6, valorUnitario: 89 }] },
  ];
  assert.deepEqual(nomesDeProdutos(vendas), ["Cropped tricô", "Vestido midi", "Calça wide leg"]);
});

test("mensagem de erro: a da API quando vem; o 403 em texto puro do guard cai no padrão", () => {
  assert.equal(mensagemDeErro({ error: "Digite o número com DDD." }, "padrão"), "Digite o número com DDD.");
  assert.equal(mensagemDeErro(null, "padrão"), "padrão");
  assert.equal(mensagemDeErro({ error: "" }, "padrão"), "padrão");
  assert.equal(mensagemDeErro({ message: "x" }, "padrão"), "padrão");
});

test("total acima do teto do servidor é recusado na tela", () => {
  const caro = linha("Vestido", "9999", "999999,99");
  assert.deepEqual(validarLinhas([caro, caro]), { ok: false, erro: ERRO_TOTAL_ALTO });
  assert.equal(validarLinhas([caro]).ok, true);
});

test("só quantidade inteira de 1 a 9999 entra na conta da tela", () => {
  for (const quantidade of ["2.5", "-2", "1e3", "0x10", "0", "10000", "abc"]) {
    assert.equal(subtotalDaLinha(linha("A", quantidade, "10")), 0, quantidade);
    assert.equal(pecasDasLinhas([linha("A", quantidade, "10")]), 0, quantidade);
    assert.equal(validarLinhas([linha("A", quantidade, "10")]).ok, false, quantidade);
  }
  assert.equal(subtotalDaLinha(linha("A", " 3 ", "10")), 30);
});

test("total dos itens do POST em centavos, igual ao das linhas", () => {
  assert.equal(totalDosItens([{ nome: "A", quantidade: 3, valorUnitario: 0.1 }, { nome: "B", quantidade: 1, valorUnitario: 149.9 }]), 150.2);
  assert.equal(totalDosItens([]), 0);
});

test("201 com corpo ilegível ainda é venda registrada: cai na venda montada na tela, sem quebrar", () => {
  const local: VendaDoMes = {
    id: "", cliente: "Maria", telefone: "5511987654321", total: 10, criadaEm: "2026-10-10T12:00:00Z", itens: [], editavel: true,
    origem: "manual",
  };
  for (const corpo of [null, "ok", 42, [], {}, { total: "10" }, { total: 10, telefone: 5 }, { total: Number.NaN, telefone: "x", cliente: null }]) {
    assert.equal(vendaDaResposta(corpo, local), local, JSON.stringify(corpo));
  }
  const doServidor = { ...local, id: "v1", cliente: null, total: 12.5 };
  assert.equal(vendaDaResposta(doServidor, local), doServidor);
  assert.doesNotThrow(() => nomeDoCliente(vendaDaResposta(null, local)));
});
