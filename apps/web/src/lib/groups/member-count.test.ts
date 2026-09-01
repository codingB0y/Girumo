import assert from "node:assert/strict";
import { escolherContagem } from "./member-count";

// O caso que motivou a regra: payload truncado quer rebaixar 503 para 1.
assert.deepEqual(escolherContagem(1, 503), { members: 503, protegido: true });
assert.deepEqual(escolherContagem(0, 503), { members: 503, protegido: true });

// Grupo novo entra com o que o provedor mandou, inclusive 1 — grupo recém
// criado pelo auto-grow tem só o nosso número mesmo.
assert.deepEqual(escolherContagem(1, undefined), { members: 1, protegido: false });
assert.deepEqual(escolherContagem(0, undefined), { members: 0, protegido: false });

// Contagem que desce mas continua plausível NÃO é protegida: gente sai de
// grupo todo dia, e travar isso congelaria o número para sempre.
assert.deepEqual(escolherContagem(400, 503), { members: 400, protegido: false });
assert.deepEqual(escolherContagem(2, 503), { members: 2, protegido: false });

// Subir sempre passa.
assert.deepEqual(escolherContagem(700, 503), { members: 700, protegido: false });

// 1 em cima de 1 não é rebaixamento — nada a proteger, senão o grupo que de
// fato tem 1 membro ficaria marcado como protegido para sempre.
assert.deepEqual(escolherContagem(1, 1), { members: 1, protegido: false });
assert.deepEqual(escolherContagem(1, 0), { members: 1, protegido: false });

console.log("member-count: ok");
