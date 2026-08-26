import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  controllerLine,
  controllerSentence,
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY,
  LEGAL_ENTITY_PENDING,
  LEGAL_VERSION,
  maskedTaxId,
} from "./legal";

/** Só os dígitos, como alguém raspando a página procuraria. */
const CPF_DIGITOS = LEGAL_ENTITY.taxId.replace(/\D/g, "");

test("o CPF completo nunca sai numa string publicavel", () => {
  // Decisao do Igor em 26/08: identifica a fornecedora pelo miolo do CPF e
  // fornece o numero inteiro a quem pedir. Publicar inteiro em pagina indexada
  // entrega o dado para raspagem, e CPF vazado alimenta fraude de abertura de
  // conta. Este teste e a trava dessa decisao.
  for (const texto of [controllerLine(), controllerSentence()]) {
    assert.doesNotMatch(texto, new RegExp(CPF_DIGITOS), `CPF completo vazou em: ${texto}`);
    assert.ok(!texto.includes(LEGAL_ENTITY.taxId), `CPF formatado vazou em: ${texto}`);
  }
});

test("as paginas legais nao imprimem LEGAL_ENTITY.taxId direto", () => {
  // Interpolar `LEGAL_ENTITY.taxId` numa page burlaria `maskedTaxId` sem que
  // nenhum teste de string percebesse — o valor so aparece em runtime.
  const appRoot = process.cwd();
  for (const rota of ["termos", "privacidade"]) {
    const fonte = readFileSync(path.join(appRoot, "src", "app", rota, "page.tsx"), "utf8");
    assert.doesNotMatch(
      fonte,
      /LEGAL_ENTITY\.taxId/,
      `${rota}/page.tsx usa taxId direto — use maskedTaxId()`,
    );
  }
});

test("a mascara preserva o miolo e esconde as pontas", () => {
  const mascarado = maskedTaxId();

  assert.match(mascarado, /^\*\*\*\./, "os tres primeiros digitos precisam sumir");
  assert.match(mascarado, /-\*\*$/, "os digitos verificadores precisam sumir");
  assert.match(mascarado, /075\.951/, "o miolo fica, para a pessoa conferir");
});

test("identifica a responsavel pelo nome, nao so pela marca", () => {
  // Sem o nome civil o documento nao cumpre o dever de identificar o fornecedor
  // (CDC, art. 6o, III) — mascarar o CPF nao pode virar anonimato.
  assert.equal(LEGAL_ENTITY_PENDING, false);
  assert.match(controllerLine(), /Marta Domingos Toledo/);
  assert.match(controllerSentence(), /Marta Domingos Toledo/);
});

test("nao sobrou vocabulario de pessoa juridica", () => {
  // A operacao e de pessoa fisica: falar em CNPJ ou razao social num contrato
  // assinado por PF confunde quem le e enfraquece o documento.
  for (const rota of ["termos", "privacidade"]) {
    const fonte = readFileSync(path.join(process.cwd(), "src", "app", rota, "page.tsx"), "utf8");
    assert.doesNotMatch(fonte, /CNPJ/, `${rota}/page.tsx ainda fala em CNPJ`);
  }
  assert.doesNotMatch(controllerLine(), /CNPJ/);
});

test("versao e contato existem — sao o que torna o aceite provavel", () => {
  // Sufixo opcional de revisao: dois textos diferentes podem sair no MESMO dia
  // (aconteceu em 26/08, quando o Sentry entrou na lista de operadores), e a
  // versao precisa distinguir os dois — e ela que o aceite grava.
  assert.match(LEGAL_VERSION, /^\d{4}-\d{2}-\d{2}(\.\d+)?$/);
  assert.match(LEGAL_CONTACT_EMAIL, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
});
