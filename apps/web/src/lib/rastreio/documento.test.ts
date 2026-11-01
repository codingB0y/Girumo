import assert from "node:assert/strict";
import { test } from "node:test";
import { gerarCnpj, gerarCpf } from "@/test/rastreio-dados-falsos";
import { docHmac, normalizarDocumento, pepperDoRastreio, ultimos4 } from "@/lib/rastreio/documento";

const cpf = gerarCpf("123456789"), cnpj = gerarCnpj("112223330001");
const fmtCpf = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
const fmtCnpj = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
const trocaUltimo = (d: string) => d.slice(0, -1) + String((Number(d.slice(-1)) + 1) % 10);
test("os geradores batem com os exemplos publicados", () => {
  assert.deepEqual([gerarCpf("111444777"), cpf, cnpj, gerarCnpj("12ABC34501DE")], ["11144477735", "12345678909", "11222333000181", "12ABC34501DE35"]);
});
test("documento digitado com ponto, traço, barra ou espaço vira só os caracteres", () => {
  for (const e of [fmtCpf, fmtCpf.replace(/[.-]/g, " "), ` ${cpf} `]) assert.deepEqual(normalizarDocumento(e), { tipo: "cpf", digitos: cpf }, e);
  assert.deepEqual(normalizarDocumento(fmtCnpj), { tipo: "cnpj", digitos: cnpj });
  assert.deepEqual(normalizarDocumento("12.abc.345/01de-35"), { tipo: "cnpj", digitos: "12ABC34501DE35" });
});
test("dígito errado, tamanho errado ou tudo igual não é documento", () => {
  for (const e of [trocaUltimo(cpf), trocaUltimo(cnpj), cpf.slice(1), "000.000.000-00", "11111111111111", "", "abc"])
    assert.equal(normalizarDocumento(e), null, e);
});
test("docHmac é HMAC-SHA256 em hex com o pepper como chave", () => {
  // Valor de referência calculado à parte (Python hmac), chave de 32 caracteres: prende algoritmo, ordem chave/mensagem e formato.
  assert.equal(docHmac("what do ya want for nothing?", "k".repeat(32)), "4f63351605b85f42e803b30e42c1905fed065a563ff4295a47982e43f228e097");
  assert.notEqual(docHmac(cpf, "a".repeat(32)), docHmac(cpf, "b".repeat(32)));
});
test("pepper: 32 caracteres no mínimo, aparado, e o valor nunca no erro", () => {
  delete process.env.RASTREIO_DOC_PEPPER;
  assert.throws(() => pepperDoRastreio(), /RASTREIO_DOC_PEPPER/);
  process.env.RASTREIO_DOC_PEPPER = "segredo-curto-de-teste";
  assert.throws(() => pepperDoRastreio(), (e: Error) => /RASTREIO_DOC_PEPPER/.test(e.message) && !e.message.includes("segredo-curto"));
  process.env.RASTREIO_DOC_PEPPER = ` ${"p".repeat(32)}\n`;
  assert.equal(pepperDoRastreio(), "p".repeat(32));
});
test("ultimos4 do telefone canônico", () => assert.equal(ultimos4("5511987654321"), "4321"));
test("docHmac falha fechado com pepper curto, sem pôr o pepper nem o documento no erro", () => {
  for (const pepper of ["", "curto-demais-segredo-de-teste"])
    assert.throws(() => docHmac(cpf, pepper), (e: Error) => /RASTREIO_DOC_PEPPER/.test(e.message) && !e.message.includes(cpf) && (!pepper || !e.message.includes(pepper)));
});
