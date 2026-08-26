import test from "node:test";
import assert from "node:assert/strict";

import { LEGAL_VERSION } from "./legal";
import {
  buildAcceptanceRows,
  checkLegalVersion,
  clientIpFromHeaders,
  recordLegalAcceptance,
  userAgentFromHeaders,
} from "./legal-acceptance";

test("aceita a versao corrente dos documentos", () => {
  const check = checkLegalVersion(LEGAL_VERSION);
  assert.equal(check.ok, true);
});

test("recusa cadastro sem aceite", () => {
  // O caso comum: alguem chama a API direto, sem passar pela tela. O checkbox
  // do cliente nao protege nada — quem decide e o servidor.
  for (const ausente of [undefined, null, ""]) {
    const check = checkLegalVersion(ausente);
    assert.equal(check.ok, false, `${JSON.stringify(ausente)} nao pode passar`);
    if (check.ok) return;
    assert.equal(check.status, 400);
    assert.match(check.error, /Termos/i, "a mensagem precisa dizer o que falta");
  }
});

test("recusa aceite de versao antiga e manda recarregar", () => {
  // Aba aberta desde antes de subirmos LEGAL_VERSION. Aceitar assim gravaria
  // consentimento de um texto que a pessoa nunca viu.
  const check = checkLegalVersion("2020-01-01");
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.equal(check.status, 409, "versao defasada e conflito, nao dado invalido");
  assert.match(check.error, /recarregue|atualiz/i);
});

test("recusa qualquer coisa que nao seja string", () => {
  for (const lixo of [1, true, {}, [], { version: LEGAL_VERSION }]) {
    const check = checkLegalVersion(lixo);
    assert.equal(check.ok, false, `${JSON.stringify(lixo)} nao pode passar`);
  }
});

test("grava uma linha por documento, com a mesma versao", () => {
  // Um checkbox, dois documentos. Guardar as duas linhas deixa versionar
  // Termos e Privacidade separado depois sem reescrever o historico.
  const rows = buildAcceptanceRows({
    authUserId: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    version: LEGAL_VERSION,
    ip: "203.0.113.7",
    userAgent: "Mozilla/5.0",
    source: "signup",
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.document).sort(),
    ["privacy", "terms"],
  );
  for (const row of rows) {
    assert.equal(row.version, LEGAL_VERSION);
    assert.equal(row.auth_user_id, "11111111-1111-4111-8111-111111111111");
    assert.equal(row.tenant_id, "22222222-2222-4222-8222-222222222222");
    assert.equal(row.ip, "203.0.113.7");
    assert.equal(row.source, "signup");
  }
});

test("le o IP do cliente na frente da lista do proxy", () => {
  // Na Vercel o header vem "cliente, proxy1, proxy2". Pegar o ultimo grava o
  // IP da propria infra e a prova de consentimento nao aponta para ninguem.
  const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
  assert.equal(clientIpFromHeaders(headers), "203.0.113.7");
});

test("cai para x-real-ip e devolve null sem cabecalho nenhum", () => {
  assert.equal(clientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.5" })), "198.51.100.5");
  assert.equal(clientIpFromHeaders(new Headers()), null);
});

test("nao deixa o user-agent crescer sem limite", () => {
  // Campo controlado pelo cliente. Sem teto, um POST guarda o que quiser.
  const headers = new Headers({ "user-agent": "x".repeat(5000) });
  const ua = userAgentFromHeaders(headers);
  assert.ok(ua && ua.length <= 512, `user-agent ficou com ${ua?.length} caracteres`);
});

test("grava o aceite de forma idempotente, na tabela certa", () => {
  // Duplo clique e retry de rede nao podem gerar duas provas do mesmo aceite:
  // o insert precisa casar com o indice unico (auth_user_id, document, version).
  const chamadas: Array<{ tabela: string; linhas: unknown; opcoes: unknown }> = [];
  const fake = {
    from(tabela: string) {
      return {
        async upsert(linhas: unknown, opcoes: unknown) {
          chamadas.push({ tabela, linhas, opcoes });
          return { error: null };
        },
      };
    },
  };

  return recordLegalAcceptance(fake, {
    authUserId: "11111111-1111-4111-8111-111111111111",
    tenantId: null,
    version: LEGAL_VERSION,
    ip: null,
    userAgent: null,
    source: "google_oauth",
  }).then((erro) => {
    assert.equal(erro, null);
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].tabela, "legal_acceptances");
    assert.deepEqual(chamadas[0].opcoes, {
      onConflict: "auth_user_id,document,version",
      ignoreDuplicates: true,
    });
    assert.equal((chamadas[0].linhas as unknown[]).length, 2);
  });
});

test("devolve a falha do banco em vez de engolir", async () => {
  // Aceite que nao gravou e conta sem prova de consentimento. Quem chama
  // precisa poder decidir o que fazer — silencio aqui recria o bug do 204 que
  // escondia RPC ausente no funil da LP.
  const fake = {
    from() {
      return {
        async upsert() {
          return { error: { message: "conexao caiu" } };
        },
      };
    },
  };

  const erro = await recordLegalAcceptance(fake, {
    authUserId: "11111111-1111-4111-8111-111111111111",
    tenantId: null,
    version: LEGAL_VERSION,
    ip: null,
    userAgent: null,
    source: "signup",
  });

  assert.equal(erro, "conexao caiu");
});
