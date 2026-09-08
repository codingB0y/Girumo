import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cenaDaProtecao,
  etiquetaDoTom,
  mostraSaudeDoNumero,
  numerosComHistorico,
  textoDeGruposSeus,
  usoDeHoje,
} from "./saude-numero";

test("desconectado ganha do tom: 'Requer ação' não diz o que houve", () => {
  // Mutante: ler `tone` antes de `connected`. Desconectado também é "risco" no
  // domínio, e a etiqueta viraria "Requer ação" — verdadeiro e inútil, na
  // única hora em que a causa é a informação que importa.
  assert.deepEqual(etiquetaDoTom({ connected: false, tone: "risco" }), {
    texto: "Desconectado",
    tom: "risco",
  });
  assert.deepEqual(etiquetaDoTom({ connected: false, tone: "ok" }), {
    texto: "Desconectado",
    tom: "risco",
  });
  assert.deepEqual(etiquetaDoTom({ connected: true, tone: "ok" }), {
    texto: "Saudável",
    tom: "ok",
  });
  assert.deepEqual(etiquetaDoTom({ connected: true, tone: "atencao" }), {
    texto: "Atenção",
    tom: "atencao",
  });
  assert.deepEqual(etiquetaDoTom({ connected: true, tone: "risco" }), {
    texto: "Requer ação",
    tom: "risco",
  });
});

test("barra de cota não desenha consumo onde não houve consumo", () => {
  // Mutante: copiar o piso incondicional das barras de lotação da Vitrine.
  // Ali o piso existe para a peça não sumir; aqui a barra mede gasto de cota,
  // e um tracinho com zero enviadas sugere gasto que não aconteceu.
  assert.equal(usoDeHoje({ usedToday: 0, dailyCap: 40, usedRatio: 0 }).proporcao, 0);
  // Com uma mensagem já enviada, o piso entra para o traço ser visível.
  assert.equal(usoDeHoje({ usedToday: 1, dailyCap: 400, usedRatio: 0.0025 }).proporcao, 0.03);
});

test("uso de hoje: restante, teto da barra e o limiar de 90%", () => {
  const meio = usoDeHoje({ usedToday: 20, dailyCap: 50, usedRatio: 0.4 });
  assert.equal(meio.restante, 30);
  assert.equal(meio.proporcao, 0.4);
  assert.equal(meio.perto, false);

  assert.equal(usoDeHoje({ usedToday: 45, dailyCap: 50, usedRatio: 0.9 }).perto, true);
  // Mutante: `>` no lugar de `>=` tira o aviso justamente no limiar.
  assert.equal(usoDeHoje({ usedToday: 44, dailyCap: 50, usedRatio: 0.89 }).perto, false);
});

test("restante nunca fica negativo e a barra não estoura", () => {
  const estourado = usoDeHoje({ usedToday: 60, dailyCap: 50, usedRatio: 1.2 });
  assert.equal(estourado.restante, 0);
  assert.equal(estourado.proporcao, 1);
});

test("o bloco filtra por HISTÓRICO, não por sessão aberta", () => {
  // Mutante: filtrar por `connected`. O bloco sumia exatamente quando o número
  // caiu — a única hora em que o lojista precisa dele.
  const numeros = [
    { instanceId: "a", everConnected: true, connected: false },
    { instanceId: "b", everConnected: false, connected: false },
  ];
  assert.deepEqual(
    numerosComHistorico(numeros).map((n) => n.instanceId),
    ["a"],
  );
  assert.deepEqual(numerosComHistorico(null), []);
});

test("some na falha, mas espera com esqueleto enquanto carrega", () => {
  // Mutante: tratar `null` como "nada a mostrar" faz a seção inteira piscar em
  // toda abertura, em vez de desenhar o esqueleto.
  assert.equal(mostraSaudeDoNumero(null, false), true);
  assert.equal(mostraSaudeDoNumero(null, true), false);
  assert.equal(mostraSaudeDoNumero([{ everConnected: true }], false), true);
  // Instância criada e nunca pareada não tem rampa para mostrar.
  assert.equal(mostraSaudeDoNumero([{ everConnected: false }], false), false);
  assert.equal(mostraSaudeDoNumero([], false), false);
});

test("sem grupo administrado não é 'protegido' — é pergunta que não se aplica", () => {
  // Mutante: cair em "protegido" quando administrados é 0 elogia o nada.
  assert.equal(cenaDaProtecao({ administrados: 0, semBackup: 0, medidos: 0 }), "nao-se-aplica");
  assert.equal(cenaDaProtecao(null), "nao-se-aplica");
});

test("risco ganha de tudo; sem medição não é sinal verde", () => {
  // Mutante: checar `medidos` antes de `semBackup` esconde o grupo órfão —
  // o único prejuízo irreversível do produto.
  assert.equal(cenaDaProtecao({ administrados: 5, semBackup: 2, medidos: 5 }), "risco");
  assert.equal(cenaDaProtecao({ administrados: 5, semBackup: 0, medidos: 5 }), "protegido");
  assert.equal(cenaDaProtecao({ administrados: 5, semBackup: 0, medidos: 0 }), "nao-medido");
});

test("plural de 'grupo seu'", () => {
  assert.equal(textoDeGruposSeus(1), "1 grupo seu");
  assert.equal(textoDeGruposSeus(0), "0 grupos seus");
  assert.equal(textoDeGruposSeus(1200), "1.200 grupos seus");
});
