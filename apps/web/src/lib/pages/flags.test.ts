import assert from "node:assert/strict";
import { parseFlag, V2_TEMPLATE_SLUG } from "./flags";

// Nasce desligada: fundir na main não muda, sozinho, o que a lojista vê (§6).
assert.equal(parseFlag(undefined), false);
assert.equal(parseFlag(""), false);

// Só "on" liga. Env var é texto, e Boolean("false") é true — se a flag fosse por
// truthiness, escrever "false" pra desligar LIGARIA, e o rollback falharia
// justamente na hora em que alguém precisa dele.
assert.equal(parseFlag("on"), true);
assert.equal(parseFlag("off"), false);
assert.equal(parseFlag("false"), false);
assert.equal(parseFlag("0"), false);
assert.equal(parseFlag("true"), false); // explícito: só "on" vale
assert.equal(parseFlag("ON"), false); // sem adivinhação de caixa

// O template do modelo único é o que a tela de criação procura por slug.
assert.equal(V2_TEMPLATE_SLUG, "oferta-impacto");

console.log("flags tests passed");
