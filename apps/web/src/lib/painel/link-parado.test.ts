import assert from "node:assert/strict";
import { test } from "node:test";

import type { LotadoDestino } from "@/lib/campaigns/settings";
import { paradoDoLink } from "./link-parado";

const aviso: LotadoDestino = { modo: "aviso" };
const lista: LotadoDestino = { modo: "pagina", pagina_slug: "espera" };
const outroLink: LotadoDestino = { modo: "url", url: "https://exemplo.com.br" };
const campanha = ["120363000000000001@g.us"];

test("pool vazio: sem grupo na campanha é grave; grupo que não chegou à tela não vira certeza", () => {
  assert.equal(paradoDoLink("empty-pool", [], 3, aviso).grave, true);

  // /api/groups falhou (a tela recebe []): não dá para afirmar que os grupos sumiram.
  const naoLeu = paradoDoLink("empty-pool", campanha, 0, aviso);
  assert.equal(naoLeu.grave, false);
  assert.match(naoLeu.texto, /não apareceram aqui/);

  const sumiram = paradoDoLink("empty-pool", campanha, 4, aviso);
  assert.equal(sumiram.grave, true);
  assert.match(sumiram.texto, /não estão mais na sua conta/);
});

test("lotado segue o destino configurado, como o /r/", () => {
  assert.deepEqual(paradoDoLink("all-full", campanha, 1, lista), {
    texto: "Nenhum grupo da campanha tem vaga: os que têm convite e são do seu número passaram de 95%: quem clicar agora vai para a sua lista de espera.",
    grave: false,
  });
  assert.match(paradoDoLink("all-full", campanha, 1, outroLink).texto, /outro link que você configurou/);
  const soAviso = paradoDoLink("all-full", campanha, 1, aviso);
  assert.equal(soAviso.grave, true, "ninguém entra e ninguém fica guardado");
  assert.match(soAviso.texto, /aviso de que os grupos estão cheios/);
});

test("sem convite ou sem admin nunca vai para a lista de espera: o lojista precisa ver o que arrumar", () => {
  for (const motivo of ["no-invite", "no-admin"] as const) {
    const parado = paradoDoLink(motivo, campanha, 1, lista);
    assert.equal(parado.grave, true, motivo);
    assert.match(parado.texto, /não entra em grupo nenhum/, motivo);
  }
});

test("encerrada é o fim planejado: não pinta de erro e diz o aviso certo", () => {
  const encerrada = paradoDoLink("closed", campanha, 1, aviso);
  assert.equal(encerrada.grave, false);
  assert.match(encerrada.texto, /aviso de que a campanha encerrou/);
  assert.match(paradoDoLink("closed", campanha, 1, lista).texto, /lista de espera/);
});
