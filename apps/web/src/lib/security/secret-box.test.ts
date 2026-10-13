import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { abrir, chaveDeIntegracoes, selar } from "./secret-box";

const CHAVE = randomBytes(32);
const CTX = "bling:t1:refresh";

/** Erro do cofre: prefixo fixo e nada do texto aberto na mensagem. */
function erroDoCofre(texto: string) {
  return (e: unknown) => e instanceof Error && e.message.startsWith("secret-box:") && !e.message.includes(texto);
}

function env(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...vars, NODE_ENV: "test" };
}

test("ida e volta, inclusive o JWT de 3.000 caracteres do Bling", () => {
  for (const texto of ["", "token-curto", "ç ã 🙂", "x".repeat(3000)]) {
    assert.equal(abrir(selar(texto, CTX, CHAVE), CTX, CHAVE), texto);
  }
});

test("formato v1.<iv>.<tag>.<cifra> em base64url; dois selar do mesmo texto saem diferentes", () => {
  const a = selar("mesmo texto", CTX, CHAVE);
  const b = selar("mesmo texto", CTX, CHAVE);
  assert.match(a, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/);
  assert.notEqual(a, b);
  assert.ok(!a.includes("mesmo"));
});

test("adulterar qualquer caractere de qualquer parte → erro", () => {
  const texto = "refresh-token-de-teste";
  const partes = selar(texto, CTX, CHAVE).split(".");
  partes.forEach((parte, i) => {
    for (let j = 0; j < parte.length; j++) {
      const trocado = parte[j] === "A" ? "B" : "A";
      const adulterado = partes.map((p, k) => (k === i ? p.slice(0, j) + trocado + p.slice(j + 1) : p)).join(".");
      assert.throws(() => abrir(adulterado, CTX, CHAVE), erroDoCofre(texto), `parte ${i}, posição ${j}`);
    }
  });
});

test("contexto trocado, chave errada ou formato quebrado → erro sem vazar o texto", () => {
  const texto = "segredo-x";
  const selado = selar(texto, CTX, CHAVE);
  const casos: Array<() => string> = [
    () => abrir(selado, "bling:t2:refresh", CHAVE),
    () => abrir(selado, "bling:t1:access", CHAVE),
    () => abrir(selado, CTX, randomBytes(32)),
    () => abrir(selado, CTX, randomBytes(16)),
    () => abrir(selado.replace(/^v1\./, "v2."), CTX, CHAVE),
    () => abrir(`${selado}.extra`, CTX, CHAVE),
    () => abrir(selado.split(".").slice(0, 3).join("."), CTX, CHAVE),
    () => abrir(`${selado}=`, CTX, CHAVE),
    () => abrir("", CTX, CHAVE),
    () => abrir("lixo", CTX, CHAVE),
  ];
  for (const caso of casos) assert.throws(caso, erroDoCofre(texto));
});

test("selar com chave de tamanho errado → erro do cofre", () => {
  assert.throws(() => selar("token-qualquer", CTX, randomBytes(31)), erroDoCofre("token-qualquer"));
});

test("chaveDeIntegracoes: base64 de exatamente 32 bytes; o resto é null", () => {
  const b64 = (n: number) => randomBytes(n).toString("base64");
  const boa = b64(32);
  assert.deepEqual(chaveDeIntegracoes(env({ INTEGRATIONS_ENCRYPTION_KEY: boa })), Buffer.from(boa, "base64"));
  // Espaço ou quebra de linha colados no painel da Vercel, e base64 sem o "=" final.
  assert.deepEqual(chaveDeIntegracoes(env({ INTEGRATIONS_ENCRYPTION_KEY: ` ${boa}\n` })), Buffer.from(boa, "base64"));
  assert.deepEqual(chaveDeIntegracoes(env({ INTEGRATIONS_ENCRYPTION_KEY: boa.replace(/=+$/, "") })), Buffer.from(boa, "base64"));
  const ruins = [undefined, "", "   ", b64(31), b64(33), b64(16), "lixo", "!".repeat(44), `${boa.slice(0, 40)}!!!=`];
  for (const ruim of ruins) assert.equal(chaveDeIntegracoes(env({ INTEGRATIONS_ENCRYPTION_KEY: ruim })), null, String(ruim));
  assert.equal(chaveDeIntegracoes(env({})), null);
});
