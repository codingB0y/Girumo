import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cenaDaConexao,
  etiquetaDaConexao,
  telefoneNaVitrine,
  type InstanciaDaTela,
} from "./conectar";

function instancia(over: Partial<InstanciaDaTela> = {}): InstanciaDaTela {
  return {
    status: "disconnected",
    phone: null,
    qr_code: null,
    connected_at: null,
    metadata: null,
    ...over,
  };
}

/* -------------------------------------------------------------------------- */
/* Cena: qual das três telas mostrar.                                          */
/* -------------------------------------------------------------------------- */

test("sessão aberta é a cena do número, mesmo sem carimbo de pareamento", () => {
  assert.equal(
    cenaDaConexao({ instancia: instancia({ status: "connected" }), carregando: false, erro: null }),
    "conectado",
  );
});

/**
 * O caso de todo cliente em produção: conectado E com carimbo. Ler o carimbo
 * antes do status manda quem está no ar para a tela de reconexão — e os dois
 * testes vizinhos, cada um com só metade do dado, passariam assim mesmo.
 */
test("sessão aberta com carimbo antigo continua sendo a cena do número", () => {
  const viva = instancia({ status: "connected", connected_at: "2026-08-01T12:00:00Z" });
  assert.equal(cenaDaConexao({ instancia: viva, carregando: false, erro: null }), "conectado");
});

test("carimbo de pareamento sem sessão é reconexão, não primeiro acesso", () => {
  const antes = instancia({ connected_at: "2026-08-01T12:00:00Z" });
  assert.equal(cenaDaConexao({ instancia: antes, carregando: false, erro: null }), "reconexao");
});

test("sem carimbo e sem sessão é primeiro acesso", () => {
  assert.equal(
    cenaDaConexao({ instancia: instancia(), carregando: false, erro: null }),
    "primeiro-acesso",
  );
});

test("tenant ainda sem instância nenhuma é primeiro acesso", () => {
  assert.equal(
    cenaDaConexao({ instancia: null, carregando: false, erro: null }),
    "primeiro-acesso",
  );
});

/**
 * Ausência de dado ≠ primeiro acesso. Se a consulta ainda não respondeu ou
 * falhou, `instancia` é null pelos mesmos dois motivos que "este tenant nunca
 * pareou" — e a tela dizia "Vamos conectar seu WhatsApp · leva 2 minutos" para
 * quem está conectado há meses.
 */
test("consulta em voo é cena de espera, não primeiro acesso", () => {
  assert.equal(cenaDaConexao({ instancia: null, carregando: true, erro: null }), "consultando");
});

/**
 * "Ainda não respondeu" e "respondeu que falhou" são cenas DIFERENTES, e é a
 * segunda que trava o cliente: o gate de plano (402) devolve erro sem instância
 * nenhuma, então uma cena só, desenhada como esqueleto, engolia a mensagem e o
 * link de upgrade — sem botão, sem texto, para sempre.
 */
test("consulta que falhou é cena própria, não a mesma da espera", () => {
  assert.equal(cenaDaConexao({ instancia: null, carregando: false, erro: "500" }), "sem-resposta");
});

test("erro vence a espera: quem já sabe da falha não fica no esqueleto", () => {
  assert.equal(cenaDaConexao({ instancia: null, carregando: true, erro: "402" }), "sem-resposta");
});

test("com instância na mão, carregar de novo não apaga a cena", () => {
  const viva = instancia({ status: "connected" });
  assert.equal(cenaDaConexao({ instancia: viva, carregando: true, erro: null }), "conectado");
  assert.equal(cenaDaConexao({ instancia: viva, carregando: false, erro: "falhou" }), "conectado");
});

/* -------------------------------------------------------------------------- */
/* Etiqueta: o estado da conexão em uma palavra, sem cor como único sinal.     */
/* -------------------------------------------------------------------------- */

test("conectado é a etiqueta do número no ar", () => {
  const e = etiquetaDaConexao({
    instancia: instancia({ status: "connected" }),
    carregando: false,
    erro: null,
  });
  assert.equal(e.texto, "Conectado");
  assert.equal(e.tom, "conectado");
});

test("pareou e está subindo a sessão não é espera nem erro", () => {
  const e = etiquetaDaConexao({
    instancia: instancia({ status: "connecting" }),
    carregando: false,
    erro: null,
  });
  assert.equal(e.texto, "Conectando");
  assert.equal(e.tom, "andamento");
});

test("com código na tela a etiqueta pede a leitura", () => {
  const e = etiquetaDaConexao({
    instancia: instancia({ status: "qr", qr_code: "2@abc" }),
    carregando: false,
    erro: null,
  });
  assert.equal(e.texto, "Aguardando leitura");
  assert.equal(e.tom, "espera");
});

test("sem código ainda, a etiqueta diz que está gerando", () => {
  const e = etiquetaDaConexao({
    instancia: instancia({ status: "pending" }),
    carregando: true,
    erro: null,
  });
  assert.equal(e.texto, "Gerando código");
  assert.equal(e.tom, "espera");
});

/**
 * O 401 vence a espera: pedir outro código no meio é o que dispara o
 * `440 connectionReplaced` e prende a sessão em ciclo. A etiqueta tem que
 * dizer que há ação a tomar mesmo quando já existe um QR na tela.
 */
test("sessão removida no celular vence o aguardando leitura", () => {
  const e = etiquetaDaConexao({
    instancia: instancia({ status: "qr", qr_code: "2@abc", metadata: { lastDisconnectReason: 401 } }),
    carregando: false,
    erro: null,
  });
  assert.equal(e.texto, "Parear de novo");
  assert.equal(e.tom, "atencao");
});

test("queda que volta sozinha não vira parear de novo", () => {
  const e = etiquetaDaConexao({
    instancia: instancia({ status: "disconnected", metadata: { lastDisconnectReason: 428 } }),
    carregando: false,
    erro: null,
  });
  assert.equal(e.texto, "Desconectado");
  assert.equal(e.tom, "atencao");
});

test("consulta sem resposta não afirma desconectado", () => {
  const e = etiquetaDaConexao({ instancia: null, carregando: false, erro: "500" });
  assert.equal(e.texto, "Sem resposta");
  assert.equal(e.tom, "indefinido");
});

test("primeira consulta em voo não afirma nada sobre o número", () => {
  const e = etiquetaDaConexao({ instancia: null, carregando: true, erro: null });
  assert.equal(e.tom, "indefinido");
});

/* -------------------------------------------------------------------------- */
/* Telefone: o número como a spec pede, em Mono, sem quebrar com lixo.         */
/* -------------------------------------------------------------------------- */

test("telefone sai no formato do cartão", () => {
  assert.equal(telefoneNaVitrine("556298191314"), "+55 62 9819•1314");
});

test("telefone já pontuado é normalizado antes de formatar", () => {
  assert.equal(telefoneNaVitrine("+55 (62) 98191314"), "+55 62 9819•1314");
});

test("celular com o nono dígito mantém tudo, só separa os quatro últimos", () => {
  assert.equal(telefoneNaVitrine("5562981911314"), "+55 62 98191•1314");
});

/**
 * O formato assume DDI na frente — é o que a Evolution grava. Um número
 * doméstico de 11 dígitos (DDD + celular) seria lido como DDI+DDD e sairia
 * como "+11 98 191•1314": errado e plausível, o pior tipo de defeito de tela.
 * Melhor recusar e cair no nome da instância.
 */
test("número sem código de país é recusado em vez de virar DDI falso", () => {
  assert.equal(telefoneNaVitrine("11981911314"), null);
  assert.equal(telefoneNaVitrine("6298191314"), null);
});

/**
 * `null.replace` derruba o cartão inteiro, e o número curto não tem DDI+DDD
 * para separar. Nos dois casos a tela cai no nome da instância, como já fazia.
 */
test("sem número utilizável devolve null em vez de texto torto", () => {
  assert.equal(telefoneNaVitrine(null), null);
  assert.equal(telefoneNaVitrine(undefined), null);
  assert.equal(telefoneNaVitrine(""), null);
  assert.equal(telefoneNaVitrine("abc"), null);
  assert.equal(telefoneNaVitrine("5562981"), null);
});
