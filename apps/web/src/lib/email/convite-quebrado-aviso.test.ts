import assert from "node:assert/strict";
import { test } from "node:test";

import type { CampanhaDoAviso } from "./link-parado-aviso";
import { conviteQuebradoDaCampanha, listaDeGrupos } from "./convite-quebrado-aviso";
import { conviteQuebradoEmail } from "./templates";

/** 12h de 12/11 em Brasília. */
const AGORA = new Date("2026-11-12T15:00:00Z");

const QUEBRADOS = new Map([
  ["g2@g.us", "Moda Kids 2"],
  ["g9@g.us", "Grupo de outra campanha"],
]);

function campanha(c: Partial<CampanhaDoAviso> = {}): CampanhaDoAviso {
  return { name: "Black Friday", slug: "bf", group_ids: ["g1@g.us", "g2@g.us", "g3@g.us"], metadata: {}, ...c };
}

test("lista só os grupos quebrados da própria campanha, com link para ela", () => {
  assert.deepEqual(conviteQuebradoDaCampanha(campanha(), QUEBRADOS, AGORA), {
    nome: "Black Friday",
    href: "/painel/campanhas/bf",
    grupos: ["Moda Kids 2"],
  });
});

test("sem grupo quebrado na campanha não há aviso", () => {
  assert.equal(conviteQuebradoDaCampanha(campanha({ group_ids: ["g1@g.us"] }), QUEBRADOS, AGORA), null);
  assert.equal(conviteQuebradoDaCampanha(campanha({ group_ids: [] }), QUEBRADOS, AGORA), null);
});

test("campanha encerrada pela data fica de fora; a que encerra hoje ainda avisa", () => {
  const encerra = (dia: string) => ({ settings: { entrada: { encerra_em: dia } } });
  assert.equal(conviteQuebradoDaCampanha(campanha({ metadata: encerra("2026-11-11") }), QUEBRADOS, AGORA), null);
  assert.notEqual(conviteQuebradoDaCampanha(campanha({ metadata: encerra("2026-11-12") }), QUEBRADOS, AGORA), null);
});

test("campanha sem nome usa o slug (o assunto não fica com buraco)", () => {
  assert.equal(conviteQuebradoDaCampanha(campanha({ name: "  " }), QUEBRADOS, AGORA)?.nome, "bf");
});

test("grupo repetido em group_ids sai uma vez só", () => {
  const aviso = conviteQuebradoDaCampanha(campanha({ group_ids: ["g2@g.us", "g2@g.us"] }), QUEBRADOS, AGORA);
  assert.deepEqual(aviso?.grupos, ["Moda Kids 2"]);
});

test("listaDeGrupos não cresce sem fim", () => {
  assert.equal(listaDeGrupos(["A"]), "A");
  assert.equal(listaDeGrupos(["A", "B"]), "A e B");
  assert.equal(listaDeGrupos(["A", "B", "C"]), "A, B e C");
  assert.equal(listaDeGrupos(["A", "B", "C", "D", "E"]), "A, B e mais 3");
});

test("e-mail: assunto conta os grupos, escapa o nome e aponta para a campanha", () => {
  const um = conviteQuebradoEmail("Ana Souza", "https://app.girumo.test", [
    { nome: "BF <24>", href: "/painel/campanhas/bf", grupos: ["Moda & Cia"] },
  ]);
  assert.equal(um.subject, "Um grupo da campanha BF <24> está com o convite quebrado");
  assert.match(um.html, /Oi Ana!/);
  assert.match(um.html, /BF &lt;24&gt;<\/a>: Moda &amp; Cia/);
  assert.match(um.html, /href="https:\/\/app\.girumo\.test\/painel\/campanhas\/bf"[^>]*>Abrir a campanha/);
  assert.match(um.html, /Revisar agora/);

  const dois = conviteQuebradoEmail("Ana", "https://app.girumo.test", [{ nome: "BF", href: "/painel/campanhas/bf", grupos: ["A", "B"] }]);
  assert.equal(dois.subject, "2 grupos da campanha BF estão com o convite quebrado");

  const varias = conviteQuebradoEmail("Ana", "https://app.girumo.test", [
    { nome: "BF", href: "/painel/campanhas/bf", grupos: ["A"] },
    { nome: "Natal", href: "/painel/campanhas/natal", grupos: ["B"] },
  ]);
  assert.equal(varias.subject, "Grupos de 2 campanhas estão com o convite quebrado");
  assert.match(varias.html, /href="https:\/\/app\.girumo\.test\/painel\/campanhas"[^>]*>Ver as campanhas/);
});
