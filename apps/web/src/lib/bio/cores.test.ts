import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FUNDOS_DO_FOCO,
  FUNDOS_DO_FOCO_FORA,
  PALETAS_PRONTAS,
  PARES_DE_CONTRASTE,
  contraste,
  coresDoModelo,
  garante,
  type TokensBio,
} from "./cores";
import { MODELOS, PALETAS, type Modelo } from "./documento";

const HEX = /^#[0-9A-F]{6}$/;

test("garante: devolve a própria cor quando já passa e empurra para o lado em que ela está", () => {
  assert.equal(garante("#16304F", "#FFFFFF", 4.5), "#16304F");
  assert.equal(garante("#16304f", "#FFFFFF", 4.5), "#16304F");
  const escurecida = garante("#999999", "#FFFFFF", 4.5);
  assert.ok(contraste(escurecida, "#FFFFFF") >= 4.5);
  assert.ok(contraste(escurecida, "#000000") < contraste("#999999", "#000000"), "texto cinza sobre branco escurece");
  const clareada = garante("#555555", "#222222", 4.5);
  assert.ok(contraste(clareada, "#222222") >= 4.5);
  assert.ok(contraste(clareada, "#FFFFFF") < contraste("#555555", "#FFFFFF"), "texto cinza sobre escuro clareia");
});

test("garante: fundo médio, onde a regra do mockup (lum > 0,4 ? preto : branco) devolvia branco com 3:1", () => {
  const cor = garante("#888888", "#959595", 4.5);
  assert.ok(contraste(cor, "#959595") >= 4.5, cor);
});

test("garante: se do próprio lado não dá, vai para o outro", () => {
  const cor = garante("#FFFFFF", "#F0F0F0", 4.5);
  assert.ok(contraste(cor, "#F0F0F0") >= 4.5, cor);
  assert.match(cor, HEX);
});

/** As variáveis que o CSS de cada modelo lê (Main.dc.html) — contrato com os PRs 3a/3b. */
const VARIAVEIS: Record<Modelo, string[]> = {
  etiqueta: ["fundo1", "fundo2", "fundo3", "on", "on2", "chip", "chipbd", "fio", "acento", "cartao", "tinta", "tinta2", "icobg", "ico", "seta", "prin", "printinta", "papel", "linha", "foco"],
  vitrine: ["fundo2", "on", "on2", "linha", "acento", "tinta", "icobg", "ico", "seta", "prin", "printinta", "papel", "foco"],
  romaneio: ["fundo1", "fundo2", "fundo3", "on", "on2", "papel", "tinta", "tinta2", "linha", "acento", "foco", "foco-fora"],
  classico: ["fundo2", "fundo3", "on", "on2", "chip", "chipbd", "acento", "cartao", "tinta", "tinta2", "icobg", "ico", "seta", "prin", "printinta", "papel", "anel", "foco"],
};

const v = (t: TokensBio, nome: string) => t[`--${nome}`];

/** Toda falha de contraste dos tokens: texto 4,5, ícone/seta 3 (pela lista) e os anéis de foco 3. */
function falhas(modelo: Modelo, t: TokensBio): string[] {
  const lista: string[] = [];
  for (const [texto, fundo, minimo] of PARES_DE_CONTRASTE[modelo]) {
    const r = contraste(v(t, texto), v(t, fundo));
    if (r < minimo) lista.push(`${texto}/${fundo} ${r.toFixed(2)} < ${minimo}`);
  }
  const anel = (nome: string, fundos: readonly string[]) => {
    for (const fundo of fundos) {
      const r = contraste(v(t, nome), v(t, fundo));
      if (r < 3) lista.push(`${nome}/${fundo} ${r.toFixed(2)}`);
    }
  };
  anel("foco", FUNDOS_DO_FOCO[modelo]);
  if (modelo === "romaneio") anel("foco-fora", FUNDOS_DO_FOCO_FORA);
  return lista;
}

/** Semente fixa: se um dia falhar, a cor que falhou é a mesma em toda máquina. */
function sorteador(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return `#${(s >>> 8).toString(16).padStart(6, "0").slice(-6).toUpperCase()}`;
  };
}

test("as 16 paletas prontas saem hex por hex do mockup (menos o foco) e passam em todos os pares", () => {
  for (const modelo of MODELOS) {
    for (const paleta of PALETAS[modelo]) {
      const t = coresDoModelo(modelo, paleta, null);
      assert.deepEqual(Object.keys(t), VARIAVEIS[modelo].map((n) => `--${n}`), `${modelo}/${paleta}`);
      for (const nome of VARIAVEIS[modelo]) {
        if (nome === "foco" || nome === "foco-fora") continue;
        assert.equal(v(t, nome), PALETAS_PRONTAS[modelo][paleta][nome], `${modelo}/${paleta} --${nome}`);
      }
      assert.deepEqual(falhas(modelo, t), [], `${modelo}/${paleta}`);
    }
  }
});

test("valores do mockup conferidos à mão, e o foco onde o dourado do mockup não serve de anel", () => {
  const t = coresDoModelo("etiqueta", "azul", null);
  assert.equal(t["--fundo1"], "#3A80BF");
  assert.equal(t["--prin"], "#E98B2B");
  assert.equal(t["--papel"], "#F6F6F2");
  // #D7A85A tem 1,9:1 contra o fundo1 e 2,6:1 contra o fundo2: o anel vira o branco do texto.
  assert.equal(t["--foco"], "#FFFFFF");
  assert.equal(t["--foco-fora"], undefined, "--foco-fora é só do Romaneio");
  // No grafite o dourado passa (5,2:1 ou mais no degradê) e fica.
  assert.equal(coresDoModelo("etiqueta", "grafite", null)["--foco"], "#D4AF37");
  // Clássico azul: o mesmo dourado contra o fundo2 (2,6:1) também cai.
  assert.equal(coresDoModelo("classico", "azul", null)["--foco"], "#FFFFFF");
});

test("Romaneio: no papel o carimbo é o anel; fora dele, de --on/preto/branco, o de maior contraste mínimo", () => {
  for (const paleta of PALETAS.romaneio) {
    const p = PALETAS_PRONTAS.romaneio[paleta];
    const t = coresDoModelo("romaneio", paleta, null);
    assert.equal(v(t, "foco"), p.foco, `${paleta}: no papel o carimbo continua sendo o anel`);
    const pior = (cor: string) => Math.min(...FUNDOS_DO_FOCO_FORA.map((f) => contraste(cor, p[f])));
    const escolhida = v(t, "foco-fora");
    assert.ok([p.on, "#000000", "#FFFFFF"].includes(escolhida), paleta);
    for (const outra of [p.on, "#000000", "#FFFFFF"]) assert.ok(pior(escolhida) >= pior(outra), `${paleta}: ${outra} tem mais`);
    assert.ok(pior(escolhida) >= 3, `${paleta}: ${pior(escolhida).toFixed(2)}`);
  }
  assert.equal(coresDoModelo("romaneio", "kraft", null)["--foco-fora"], "#000000");
});

test("500 cores de marca sorteadas: texto ≥ 4,5, ícone e seta ≥ 3, foco ≥ 3, tudo #RRGGBB", () => {
  const sorteia = sorteador(2026);
  for (let i = 0; i < 500; i++) {
    const cores = { fundo: sorteia(), botao: sorteia() };
    for (const modelo of MODELOS) {
      const t = coresDoModelo(modelo, "marca", cores);
      assert.deepEqual(Object.keys(t), VARIAVEIS[modelo].map((n) => `--${n}`));
      for (const cor of Object.values(t)) assert.match(cor, HEX);
      assert.deepEqual(falhas(modelo, t), [], `${modelo} ${cores.fundo}/${cores.botao}`);
    }
  }
});

test("os tons do meio (onde branco e preto empatam) e os extremos também fecham", () => {
  // #959595: o garante do mockup dava 3,0:1 aqui; #4B9F1D: o verde em que nem branco nem preto
  // tinham 3:1 nas duas pontas do degradê derivado do mockup; #767676: 4,5:1 cravado no branco.
  const fundos = ["#959595", "#4B9F1D", "#767676"];
  for (let canal = 0; canal < 256; canal += 5) fundos.push(`#${canal.toString(16).padStart(2, "0").repeat(3).toUpperCase()}`);
  for (const fundo of fundos) {
    for (const botao of ["#000000", "#FFFFFF", fundo, "#FF0000"]) {
      for (const modelo of MODELOS) assert.deepEqual(falhas(modelo, coresDoModelo(modelo, "marca", { fundo, botao })), [], `${modelo} ${fundo}/${botao}`);
    }
  }
});

test("marca usa as cores da loja: o fundo e o botão são os escolhidos", () => {
  const t = coresDoModelo("classico", "marca", { fundo: "#286AA6", botao: "#E98B2B" });
  assert.equal(t["--fundo2"], "#286AA6");
  assert.equal(t["--prin"], "#E98B2B");
  assert.equal(t["--on"], "#FFFFFF");
  assert.equal(coresDoModelo("classico", "marca", { fundo: "#f2f0eb", botao: "#161616" })["--on"], "#000000");
});

test("paleta que não é do modelo, ou marca sem cores válidas, cai na primeira do modelo", () => {
  const primeira = coresDoModelo("vitrine", "papel", null);
  assert.deepEqual(coresDoModelo("vitrine", "kraft", null), primeira);
  assert.deepEqual(coresDoModelo("vitrine", "marca", null), primeira);
  assert.deepEqual(coresDoModelo("vitrine", "marca", { fundo: "azul", botao: "#000000" }), primeira);
});
