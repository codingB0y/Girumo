// apps/web/src/components/painel/configuracoes/bling-painel-texto.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { OpcaoDePixel, SituacaoDoCartao } from "@/lib/bling/cartao";
import {
  campoDoValor,
  canaisParaSalvar,
  chipDoBling,
  contagem,
  detalheDasFalhas,
  detalheDoMeta,
  legendaDaSituacao,
  legendaDoCanal,
  lerValorAlto,
  linhaDaPausa,
  linhaDeEstado,
  mensagemDoRetorno,
  nomeDoCanal,
  nomeDoCsv,
  pixelEmUso,
  reais,
  reaisCurtos,
  regraDaLista,
  resumoDasSituacoes,
  resumoDoMeta,
  rotuloDoAutomatico,
  situacoesParaSalvar,
  textoDaOrigem,
  textoDoMeta,
  textoDoReconectar,
  tituloDoParado,
} from "./bling-painel-texto";

/** 14:52 em Brasília. */
const AGORA = new Date("2026-10-13T17:52:00.000Z");

const sit = (id: number, nome: string, base: number, conta = false): SituacaoDoCartao => ({
  id,
  nome,
  base,
  conta,
  bloqueada: base === 12 || base === 21,
});
const SITUACOES = [sit(6, "Em aberto", 6), sit(9, "Atendido", 9, true), sit(12, "Cancelado", 12), sit(21, "Em digitação", 21), sit(4501, "Pago", 9, true), sit(4502, "Estornado", 12)];

const pix = (campaign_id: string, campanha: string, pixel_id: string): OpcaoDePixel => ({ campaign_id, campanha, pixel_id });

test("dinheiro e contagem em pt-BR", () => {
  assert.match(reais(1840), /^R\$\s1\.840,00$/);
  assert.match(reaisCurtos(1500), /^R\$\s1\.500$/);
  assert.match(reaisCurtos(1500.5), /^R\$\s1\.500,50$/);
  assert.equal(contagem(1240), "1.240");
});

test("chip: sem acesso vence tempo real parado, que vence conectado", () => {
  assert.deepEqual(chipDoBling({ status: "reconectar", tempo_real: "parado" }), { texto: "Sem acesso", tom: "erro" });
  assert.deepEqual(chipDoBling({ status: "ativa", tempo_real: "parado" }), { texto: "Tempo real parado", tom: "alerta" });
  assert.deepEqual(chipDoBling({ status: "ativa", tempo_real: "sem_dados" }), { texto: "Conectado", tom: "ok" });
});

test("linha de estado: recebendo com a última venda, ou ainda sem vendas", () => {
  assert.deepEqual(linhaDeEstado({ ultima_venda_em: "2026-10-13T17:48:00.000Z" }, AGORA), {
    titulo: "Recebendo",
    detalhe: "última venda há 4 min",
  });
  assert.deepEqual(linhaDeEstado({ ultima_venda_em: null }, AGORA), { titulo: "Ainda sem vendas", detalhe: null });
});

test("alertas: parado há quanto tempo, pausa até que horas e o texto do reconectar", () => {
  assert.equal(tituloDoParado("2026-10-13T11:52:00.000Z", AGORA), "Tempo real parado há 6 h");
  assert.equal(tituloDoParado(null, AGORA), "Tempo real parado");
  assert.equal(linhaDaPausa("2026-10-13T18:05:00.000Z", AGORA), "Pausado até 15:05 por erros seguidos do Bling — volta sozinho.");
  assert.equal(
    textoDoReconectar("2026-10-12T17:20:00.000Z", AGORA),
    "A autorização foi removida no Bling ou venceu. Nenhuma venda nova está chegando. Última venda recebida: 12/10 14:20.",
  );
  assert.equal(textoDoReconectar(null, AGORA), "A autorização foi removida no Bling ou venceu. Nenhuma venda nova está chegando.");
});

test("retorno do OAuth: uma frase por motivo; o resto não vira mensagem", () => {
  for (const motivo of ["conectado", "recusado", "sessao", "outra_loja", "erro", "indisponivel"]) {
    assert.ok(mensagemDoRetorno(motivo)?.texto, motivo);
  }
  assert.equal(mensagemDoRetorno("conectado")?.tom, "ok");
  assert.equal(mensagemDoRetorno("outra_loja")?.tom, "erro");
  assert.equal(mensagemDoRetorno("indisponivel")?.texto, "Integração com o Bling indisponível no momento.");
  // Chave do protótipo não pode virar mensagem (nem quebrar a tela).
  assert.equal(mensagemDoRetorno("constructor"), null);
  assert.equal(mensagemDoRetorno("qualquer"), null);
  assert.equal(mensagemDoRetorno(null), null);
});

test("legenda da situação: do Bling, própria herdando, e a trava pela base", () => {
  const legenda = (id: number) => legendaDaSituacao(SITUACOES.find((s) => s.id === id)!, SITUACOES);
  assert.equal(legenda(6), "situação do Bling");
  assert.equal(legenda(9), "situação do Bling · marcada por padrão");
  assert.equal(legenda(4501), "situação própria · herda de Atendido");
  assert.equal(legenda(12), "nunca conta: vira lead qualificado");
  assert.equal(legenda(21), "ignorado até sair da digitação");
  assert.equal(legenda(4502), "herda de Cancelado · nunca conta: vira lead qualificado");
  assert.equal(resumoDasSituacoes(SITUACOES), "Atendido, Pago");
  assert.equal(resumoDasSituacoes([]), "nenhuma");
});

test("Meta por linha: venda no feminino, pedido no masculino, e a data de quem passou da janela", () => {
  const hora = "2026-09-28T13:00:00.000Z";
  assert.deepEqual(textoDoMeta({ meta: "enviado", hora, tipo: "venda" }), { texto: "Enviada", detalhe: null, tom: "ok" });
  assert.equal(textoDoMeta({ meta: "enviado", hora, tipo: "pedido" }).texto, "Enviado");
  assert.deepEqual(textoDoMeta({ meta: "fora_da_janela", hora, tipo: "venda" }), {
    texto: "Fora da janela",
    detalhe: "venda de 28/09",
    tom: "neutro",
  });
  assert.equal(textoDoMeta({ meta: "sem_dados", hora, tipo: "venda" }).texto, "Não enviada: sem telefone nem e-mail");
  assert.equal(textoDoMeta({ meta: "sem_pixel", hora, tipo: "pedido" }).texto, "Não enviado: sem pixel");
  assert.equal(textoDoMeta({ meta: "erro", hora, tipo: "venda" }).tom, "erro");
  assert.equal(textoDoMeta({ meta: null, hora, tipo: "venda" }).texto, "Aguardando");
});

test("origem da venda", () => {
  assert.equal(textoDaOrigem({ origem: "anuncio", origem_detalhe: "VIP Goiânia — Conjunto 2" }), "Anúncio · VIP Goiânia — Conjunto 2");
  assert.equal(textoDaOrigem({ origem: "grupo", origem_detalhe: null }), "Grupo");
  assert.equal(textoDaOrigem({ origem: "sem_origem", origem_detalhe: "x" }), "Sem origem");
  assert.equal(textoDaOrigem({ origem: null, origem_detalhe: null }), "—");
});

test("números: o que não foi ao Meta e as falhas com a fila", () => {
  const zero = { enviado: 0, fora_da_janela: 0, sem_pixel: 0, sem_dados: 0, desligado: 0, erro: 0 };
  assert.equal(
    detalheDoMeta({ ...zero, enviado: 207, fora_da_janela: 6, sem_dados: 1 }),
    "6 fora da janela de 7 dias do Meta · 1 sem telefone nem e-mail",
  );
  assert.equal(detalheDoMeta({ ...zero, enviado: 10 }), "nenhuma ficou de fora");
  assert.equal(detalheDasFalhas(0, 0), "nenhuma");
  assert.equal(detalheDasFalhas(2, 1200), "não entraram; voltam se o pedido mudar no Bling · 1.200 na fila agora");
});

test("regra das listas, com e sem valor alto", () => {
  assert.equal(regraDaLista("alto_valor", 1500), "Pelo menos uma venda a partir de R$ 1.500");
  assert.equal(regraDaLista("comprador", 1500), "Compraram, nenhuma venda a partir de R$ 1.500");
  assert.equal(regraDaLista("alto_valor", null), "Desligada: defina o valor alto nos ajustes");
  assert.equal(regraDaLista("comprador", null), "Compraram pelo menos uma vez");
  assert.equal(regraDaLista("lead", 1500), "Fizeram pedido e não pagaram (em aberto ou cancelado)");
});

test("valor alto: vazio desliga, ponto de milhar não vira decimal, e a régua do PATCH", () => {
  assert.deepEqual(lerValorAlto(""), { ok: true, valor: null });
  assert.deepEqual(lerValorAlto("  "), { ok: true, valor: null });
  assert.deepEqual(lerValorAlto("1.500"), { ok: true, valor: 1500 });
  assert.deepEqual(lerValorAlto("1.500,00"), { ok: true, valor: 1500 });
  assert.deepEqual(lerValorAlto("1500"), { ok: true, valor: 1500 });
  assert.deepEqual(lerValorAlto("149.90"), { ok: true, valor: 149.9 });
  assert.deepEqual(lerValorAlto("R$ 2.000,50"), { ok: true, valor: 2000.5 });
  assert.deepEqual(lerValorAlto("10.000.000"), { ok: true, valor: 10_000_000 });
  for (const ruim of ["abc", "0", "-5", "1,555", "10.000.000,01", "12.000.000"]) {
    assert.deepEqual(lerValorAlto(ruim), { ok: false }, ruim);
  }
  // O que o campo mostra volta igual ao salvar.
  assert.equal(campoDoValor(1500), "1.500,00");
  assert.equal(campoDoValor(null), "");
  assert.deepEqual(lerValorAlto(campoDoValor(1234.5)), { ok: true, valor: 1234.5 });
});

test("Salvar: as situações só vão se a dona mexeu nas caixas, e sempre com a versão das que ela viu (prova R3)", () => {
  // O formulário abriu com a lista sem "Pago": Atendido marcado pelo padrão.
  const versao = "3f0c9a1b2d4e5f60";
  const vistas = { situacoes: [sit(6, "Em aberto", 6), sit(9, "Atendido", 9, true), sit(12, "Cancelado", 12)], situacoes_versao: versao };
  // Mexeu só no valor alto: as situações não vão, e o "Pago" que o motor leu no meio não vira pedido por acidente.
  // Mutante (a prova): o formulário mandava sempre as marcadas, e o padrão de antes da releitura era congelado.
  assert.deepEqual(situacoesParaSalvar(vistas, new Set([9])), {});
  // Mexeu: as marcadas em ordem, com a versão (o PATCH responde 409 se a lista mudou no meio).
  assert.deepEqual(situacoesParaSalvar(vistas, new Set([9, 6])), { sale_situation_ids: [6, 9], situacoes_versao: versao });
  assert.deepEqual(situacoesParaSalvar(vistas, new Set()), { sale_situation_ids: [], situacoes_versao: versao });
  assert.deepEqual(situacoesParaSalvar(vistas, new Set([6])), { sale_situation_ids: [6], situacoes_versao: versao });
});

test("pixel: o da campanha escolhida, o único das campanhas, ou nenhum", () => {
  const opcoes = [pix("c1", "VIP Goiânia", "111"), pix("c2", "VIP Kids", "111")];
  assert.equal(pixelEmUso({ escolhido: "c2", opcoes }), "111");
  assert.equal(pixelEmUso({ escolhido: null, opcoes }), "111");
  assert.equal(pixelEmUso({ escolhido: null, opcoes: [...opcoes, pix("c3", "Sul", "222")] }), null);
  assert.equal(rotuloDoAutomatico(opcoes), "Automático · Pixel 111");
  assert.equal(rotuloDoAutomatico([...opcoes, pix("c3", "Sul", "222")]), "Automático: há mais de um pixel, escolha a campanha");
  assert.equal(resumoDoMeta({ meta_enabled: true, pixel: { escolhido: null, opcoes }, canais: [] }), "ligado · Pixel 111");
  assert.equal(resumoDoMeta({ meta_enabled: true, pixel: { escolhido: null, opcoes: [] }, canais: [] }), "ligado · sem pixel escolhido");
  assert.equal(resumoDoMeta({ meta_enabled: false, pixel: { escolhido: "c1", opcoes }, canais: [] }), "desligado");
});

test("canais no Salvar: só quando a dona mexeu; a lista inteira, ordenada (outra aba que marcou um canal não é desfeita sem querer)", () => {
  const canal = (id: number, fora: boolean) => ({ id, pedidos: 1, exemplos: [], ultimo_pedido_em: null, fora_do_meta: fora });
  const vistos = [canal(7, true), canal(3, false), canal(5, true)];
  assert.deepEqual(canaisParaSalvar(vistos, new Set([5, 7])), {});
  assert.deepEqual(canaisParaSalvar(vistos, new Set([7, 5, 3])), { meta_skip_store_ids: [3, 5, 7] });
  assert.deepEqual(canaisParaSalvar(vistos, new Set([7])), { meta_skip_store_ids: [7] });
  assert.deepEqual(canaisParaSalvar([], new Set()), {});
});

test("canais: o resumo do Meta diz quantos ficaram de fora; a legenda tem pedidos, o dia do último (sem fuso) e os números", () => {
  const canal = (id: number, fora: boolean) => ({
    id, nome: null, tipo: null, ativo: true, pedidos: 3, exemplos: ["1532"], ultimo_pedido_em: "2026-10-18", fora_do_meta: fora,
  });
  const pixel = { escolhido: null, opcoes: [pix("c1", "VIP", "111")] };
  assert.equal(resumoDoMeta({ meta_enabled: true, pixel, canais: [canal(1, true), canal(2, false)] }), "ligado · Pixel 111 · 1 canal fora");
  assert.equal(resumoDoMeta({ meta_enabled: true, pixel, canais: [canal(1, true), canal(2, true)] }), "ligado · Pixel 111 · 2 canais fora");
  assert.equal(resumoDoMeta({ meta_enabled: false, pixel, canais: [canal(1, true)] }), "desligado");

  // Sem o escopo de canais: o número. Com: o nome que a conta deu.
  assert.equal(nomeDoCanal(canal(200000001, false)), "Canal 200000001");
  assert.equal(nomeDoCanal({ id: 200000001, nome: "Loja Yampi" }), "Loja Yampi");
  const semNome = { nome: null, tipo: null, ativo: true };
  // "2026-10-18" é o dia do pedido no Bling: como data UTC ele viraria 17/10 em Brasília.
  assert.equal(
    legendaDoCanal({ ...semNome, pedidos: 1240, exemplos: ["1532", "1530", "1529"], ultimo_pedido_em: "2026-10-18" }),
    "1.240 pedidos · último em 18/10 · nº 1532, 1530, 1529",
  );
  assert.equal(legendaDoCanal({ ...semNome, pedidos: 1, exemplos: [], ultimo_pedido_em: null }), "1 pedido");
  assert.equal(legendaDoCanal({ ...semNome, pedidos: 0, exemplos: [], ultimo_pedido_em: null }), "sem pedido recente");
  // O tipo quando diz algo além do nome; o desabilitado avisa.
  const yampi = { nome: "Loja Yampi", tipo: "Yampi", ativo: true, pedidos: 0, exemplos: [], ultimo_pedido_em: null };
  assert.equal(legendaDoCanal(yampi), "Yampi · sem pedido recente");
  assert.equal(legendaDoCanal({ ...yampi, nome: "Yampi" }), "sem pedido recente");
  assert.equal(legendaDoCanal({ ...yampi, ativo: false, pedidos: 2, exemplos: ["9"] }), "Yampi · desabilitado no Bling · 2 pedidos · nº 9");
});

test("nome do CSV: o da rota, ou um com a lista", () => {
  assert.equal(nomeDoCsv('attachment; filename="girumo-lead-2026-10-13.csv"', "lead"), "girumo-lead-2026-10-13.csv");
  assert.equal(nomeDoCsv(null, "comprador"), "girumo-comprador.csv");
});
