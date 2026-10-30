import assert from "node:assert/strict";
import test from "node:test";
import { conhecidosDoAmbiente, criarRedator, problemas, variantesDeTelefone } from "./redigir.mjs";

const ENV = {
  YAMPI_ALIAS: "lojinha-real",
  FASE0_CELULARES: "CHIP=5521911112222,B=5521987654321",
  FASE0_MARCADORES: "dono@real.com,987654321",
  FASE0_LOJA_TERMOS: "Lojinha Real",
  FASE0_INSTANCIA: "fase0-recuperar-20261029",
};
const URLS = { publica: "https://abc-def-123.trycloudflare.com", yampi: "https://abc-def-123.trycloudflare.com/yampi/0123456789abcdef01234567" };
const EMV = "00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5913LOJINHA REAL6009SAO PAULO62070503***6304ABCD";

const ORDEM = {
  event: "order.created",
  time: "2026-10-29 23:50:00",
  merchant: { id: 4455, alias: "lojinha-real" },
  resource: {
    id: 987654,
    number: 1234,
    created_at: { date: "2026-10-29 23:50:00.000000", timezone_type: 3, timezone: "America/Sao_Paulo" },
    customer: {
      data: {
        name: "Maria da Silva",
        email: "DONO@real.com",
        cpf: "123.456.789-09",
        outro_cpf: "987.654.321-00",
        phone: { area_code: "21", number: "987654321", full_number: "21987654321", formated_number: "(21) 98765-4321" },
        apelido: "joaozinho",
      },
    },
    status: { data: { alias: "waiting_payment", name: "Aguardando pagamento" } },
    transactions: {
      data: [
        {
          payment: { data: { alias: "pix" } },
          metadata: [
            { key: "pix_qr_code", value: EMV },
            { key: "pix_expiration_date", value: "2026-10-30 00:20:00" },
          ],
        },
      ],
    },
    cpf_do_cliente: "12345678909",
    token: "AbCdEf1234567890XyZ",
    cart_token: "AbCdEf1234567890XyZ",
    unauth_simulate_url: "https://lojinha-real.yampi.io/cart/AbCdEf1234567890XyZ?customerToken=abcDEF123456&utm_source=x",
    site: "https://www.lojinhareal.com.br/r/xyz123",
    foto: "A".repeat(400),
  },
};

const redator = () => criarRedator({ sal: "sal-de-teste", conhecidos: conhecidosDoAmbiente(ENV, URLS), frases: ["SAIR"] });

test("nenhum valor real sobrevive, em nenhum formato", () => {
  const red = redator();
  const saida = JSON.stringify(red.valor(ORDEM));
  for (const real of ["lojinha-real", "lojinhareal", "Maria", "Silva", "dono@real.com", "987654321", "98765-4321", "123.456.789-09", "joaozinho", "AbCdEf1234567890XyZ", "abcDEF123456"]) {
    assert.ok(!saida.toLowerCase().includes(real.toLowerCase()), `vazou: ${real}`);
  }
  assert.deepEqual(problemas(saida, { conhecidos: conhecidosDoAmbiente(ENV, URLS), originais: red.originais() }), []);
});

test("telefone: cada forma de escrever vira o falso correspondente; DDI e 9º dígito se mantêm", () => {
  const fone = redator().valor(ORDEM).resource.customer.data.phone;
  assert.equal(fone.area_code, "11");
  assert.equal(fone.number, "999990002");
  assert.equal(fone.full_number, "11999990002");
  assert.equal(fone.formated_number.replace(/\D/g, "").length, 11); // sem lista de formatos: máscara cega mantém o formato
  assert.deepEqual(variantesDeTelefone("5521987654321", "5511999990002").slice(0, 3), [
    ["5521987654321", "5511999990002"],
    ["21987654321", "11999990002"],
    ["987654321", "999990002"],
  ]);
});

test("vocabulário fica legível; texto desconhecido é mascarado (default-deny)", () => {
  const r = redator().valor(ORDEM).resource;
  assert.equal(r.status.data.alias, "waiting_payment");
  assert.equal(r.transactions.data[0].payment.data.alias, "pix");
  assert.equal(r.transactions.data[0].metadata[0].key, "pix_qr_code");
  assert.notEqual(r.customer.data.apelido, "joaozinho");
  assert.equal(r.customer.data.apelido.length, "joaozinho".length);
  assert.equal(redator().valor({ conversation: "SAIR" }).conversation, "SAIR");
  assert.notEqual(redator().valor({ conversation: "quem é você?" }).conversation, "quem é você?");
});

test("Pix: o início do formato EMV e o tamanho ficam; o resto não", () => {
  const codigo = redator().valor(ORDEM).resource.transactions.data[0].metadata[0].value;
  assert.ok(codigo.startsWith("000201"));
  assert.equal(codigo.length, EMV.length);
  assert.ok(!codigo.includes("br.gov.bcb.pix"));
});

test("datas: tudo desloca junto, então os intervalos continuam valendo (inclusive virando o dia)", () => {
  const r = redator().valor(ORDEM).resource;
  const [criado, vence] = [r.created_at.date, r.transactions.data[0].metadata[1].value].map((s) => Date.parse(`${s.replace(" ", "T").slice(0, 19)}Z`));
  assert.equal(vence - criado, 30 * 60_000);
  assert.notEqual(r.created_at.date.slice(0, 10), "2026-10-29");
  assert.equal(r.created_at.timezone, "America/Sao_Paulo");
});

test("igualdade se preserva: mesmo original, mesmo falso; originais diferentes, falsos diferentes", () => {
  const r = redator().valor(ORDEM).resource;
  assert.equal(r.token, r.cart_token);
  assert.notEqual(r.customer.data.cpf, r.customer.data.outro_cpf);
  assert.match(r.customer.data.cpf, /^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
  assert.notEqual(r.token, "AbCdEf1234567890XyZ");
});

test("URL: a rota e as chaves da consulta ficam; loja, token e domínio próprio saem", () => {
  const r = redator().valor(ORDEM).resource;
  assert.match(r.unauth_simulate_url, /^https:\/\/loja-exemplo\.yampi\.io\/cart\/[A-Za-z0-9]+\?customerToken=[A-Za-z0-9]+&utm_source=\w$/);
  assert.match(r.site, /^https:\/\/loja-exemplo\.example\/r\/[a-z0-9]+$/);
});

test("JID mantém o domínio; telefone conhecido vira o falso; segredos e blobs somem", () => {
  const red = redator();
  assert.match(red.valor({ k: "12345678901234@lid" }).k, /^\d{14}@lid$/);
  assert.equal(red.valor({ k: "5521987654321@s.whatsapp.net" }).k, "5511999990002@s.whatsapp.net");
  assert.equal(red.valor({ sender: "5521911112222:12@s.whatsapp.net" }).sender, "5511999990001:12@s.whatsapp.net");
  assert.equal(red.valor({ apikey: "abc123def456" }).apikey, "REDACTED-INSTANCE-TOKEN");
  assert.equal(red.valor({ secret_key: "abc123def456abc123def456" }).secret_key, "REDACTED");
  assert.equal(red.valor(ORDEM).resource.foto, "[REDIGIDO len=400]");
});

test("buffer serializado (miniatura da foto) não passa, nem como array nem como objeto de bytes", () => {
  const bytes = Array.from({ length: 40 }, (_, i) => (i * 7) % 256);
  const objeto = Object.fromEntries(bytes.map((b, i) => [String(i), b]));
  const r = redator().valor({ jpegThumbnail: objeto, mediaKey: { type: "Buffer", data: bytes }, pequeno: [1, 2, 3] });
  assert.equal(r.jpegThumbnail, "[REDIGIDO bytes len=40]");
  assert.equal(r.mediaKey.data, "[REDIGIDO bytes len=40]");
  assert.deepEqual(r.pequeno, [1, 2, 3]); // array curto de números (não é blob) segue
});

test("cabeçalho da assinatura: continua base64 de 44 caracteres e deixa de ser o real", () => {
  const real = "k3Jx9mQ2vT8nLp0aZcYd4HfRgU6sWbEoIt1NqXvMeA8=";
  const h = redator().valor({ "x-yampi-hmac-sha256": real, "content-type": "application/json" });
  assert.match(h["x-yampi-hmac-sha256"], /^[A-Za-z0-9+/]{43}=$/);
  assert.notEqual(h["x-yampi-hmac-sha256"], real);
  assert.equal(h["content-type"], "application/json");
});

test("números: epoch desloca junto, dinheiro passa, documento numérico é mascarado", () => {
  const r = redator().valor({ a: 1761746591, b: 1761746651, total: 12.5, quantity: 2, cpf: 12345678909, id: 987654 });
  assert.equal(r.b - r.a, 60);
  assert.notEqual(r.a, 1761746591);
  assert.equal(r.total, 12.5);
  assert.equal(r.quantity, 2);
  assert.notEqual(r.cpf, 12345678909);
  assert.equal(r.id, 987654);
});

test("conferência: pega vazamento que a máscara deixaria passar", () => {
  const conhecidos = conhecidosDoAmbiente(ENV, URLS);
  assert.ok(problemas('{"loja":"https://Lojinha-Real.yampi.io/x"}', { conhecidos }).length > 0);
  assert.ok(problemas('{"telefone":"5521987654321"}', { conhecidos }).length > 0);
  assert.ok(problemas('{"email":"alguem@gmail.com"}', { conhecidos }).length > 0);
  assert.ok(problemas('{"d":"https://abc-def-123.trycloudflare.com/x"}', { conhecidos }).length > 0);
  assert.ok(problemas('{"v":"Maria da Silva"}', { originais: ["Maria da Silva"] }).length > 0);
  assert.deepEqual(problemas('{"email":"cliente.teste@example.com","jid":"5511999990002@s.whatsapp.net","x":"1@lid"}', { conhecidos }), []);
});
