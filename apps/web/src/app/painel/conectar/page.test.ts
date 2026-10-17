import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * A tela de conectar é um hook com polling e fetch: o render estático não
 * alcança clique nem efeito, então o comportamento fica provado no e2e
 * (`e2e/painel-vitrine-conectar.spec.ts`) e aqui fica a guarda da fonte.
 */
const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "page.tsx"), "utf8");

/** Trecho entre o começo de `inicio` e o primeiro `fim` depois dele. */
function trecho(inicio: string, fim: string): string {
  const de = fonte.indexOf(inicio);
  assert.notEqual(de, -1, `não achei "${inicio}" em page.tsx`);
  const ate = fonte.indexOf(fim, de);
  assert.notEqual(ate, -1, `não achei "${fim}" depois de "${inicio}"`);
  return fonte.slice(de, ate);
}

test("desconectar pergunta antes de derrubar a sessão", () => {
  // Um toque derrubava o WhatsApp: o logout na Evolution tira o aparelho dos
  // "Aparelhos conectados" e só volta repareando com o celular do número.
  assert.match(fonte, /import \{ useConfirmacao \} from "@\/components\/painel\/confirmacao";/);
  const corpo = trecho("const disconnect = useCallback(", "}, [");
  const pergunta = corpo.indexOf("pedirConfirmacao(");
  const acao = corpo.indexOf('runAction(instance.id, "disconnect"');
  assert.notEqual(pergunta, -1, "disconnect não pede confirmação");
  assert.notEqual(acao, -1, "disconnect não chama a ação");
  assert.ok(pergunta < acao, "a pergunta tem que vir antes da ação");
  assert.match(corpo, /destrutivo: true/);
  // A folha só aparece se for desenhada; e nada de `window.confirm`, que trava
  // a automação de teste.
  assert.match(fonte, /\{folhaDeConfirmacao\}/);
  assert.doesNotMatch(fonte, /window\.confirm/);
});

test("falha ao criar a instância solta a trava para a próxima tentativa", () => {
  // A trava nunca voltava a `false`: um 502/402 na criação deixava todo
  // "Atualizar" e todo ciclo do polling em no-op até o F5.
  const criacao = trecho("creating.current = true;", "setInstance(nova)");
  assert.match(criacao, /catch \(\w+\) \{[\s\S]*creating\.current = false;[\s\S]*throw \w+;/);
});
