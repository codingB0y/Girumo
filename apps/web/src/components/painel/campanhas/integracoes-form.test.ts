import test from "node:test";
import assert from "node:assert/strict";
import { etiquetaMeta, type IntegracoesFormValue } from "./integracoes-form";

const VAZIO: IntegracoesFormValue = {
  meta: { pixel_id: "", evento: "Lead", test_code: "", capi_token_set: false, capi_token_last4: "" },
  ga4: { id: "" },
  google_ads: { id: "", label: "" },
};

const comMeta = (p: Partial<IntegracoesFormValue["meta"]>, novo?: string): IntegracoesFormValue => ({
  ...VAZIO,
  meta: { ...VAZIO.meta, ...p },
  ...(novo === undefined ? {} : { capi_token_novo: novo }),
});

test("sem pixel: não configurado", () => {
  assert.equal(etiquetaMeta(VAZIO), "não configurado");
});

test("pixel sem token: sem token", () => {
  assert.equal(etiquetaMeta(comMeta({ pixel_id: "1234563456" })), "sem token");
});

test("pixel com token salvo: configurado", () => {
  assert.equal(etiquetaMeta(comMeta({ pixel_id: "1234563456", capi_token_set: true })), "configurado");
});

test("token digitado agora conta antes de salvar; apagar volta para sem token", () => {
  assert.equal(etiquetaMeta(comMeta({ pixel_id: "1234563456" }, "EAAG...")), "configurado");
  assert.equal(etiquetaMeta(comMeta({ pixel_id: "1234563456", capi_token_set: true }, "")), "sem token");
});

test("nenhum estado afirma que evento chegou", () => {
  // A tela não sabe se a Meta recebeu nada. Enquanto essa etiqueta vier de campo
  // preenchido, ela não pode dizer "recebendo eventos" — foi o que ela disse
  // durante as três falhas do CAPI (#229, #231, #232).
  const todos = [
    etiquetaMeta(VAZIO),
    etiquetaMeta(comMeta({ pixel_id: "1234563456" })),
    etiquetaMeta(comMeta({ pixel_id: "1234563456", capi_token_set: true })),
  ];
  for (const e of todos) assert.ok(!e.includes("recebendo"), `etiqueta "${e}" afirma recebimento`);
});
