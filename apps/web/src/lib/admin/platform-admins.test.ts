import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAdminFromQuery,
  normalizePlatformAdmins,
  type PlatformAdmin,
} from "./platform-admins";

test("erro na consulta nega o acesso mesmo com linha presente", () => {
  // O caso que justifica a ordem das checagens: o PostgREST pode devolver `data`
  // residual junto de `error`. Se olhássemos `data` primeiro, uma falha de leitura
  // liberaria o /admin — exatamente o oposto de falhar fechado.
  assert.equal(
    isAdminFromQuery({ data: { auth_user_id: "abc" }, error: { message: "boom" } }),
    false,
  );
});

test("tabela ausente nega o acesso em vez de liberar", () => {
  // Ambiente onde a migration não rodou: o erro é 42P01 (relation does not exist).
  assert.equal(
    isAdminFromQuery({ data: null, error: { code: "42P01" } }),
    false,
  );
});

test("usuário sem linha na tabela não é admin", () => {
  assert.equal(isAdminFromQuery({ data: null, error: null }), false);
  assert.equal(isAdminFromQuery({ data: undefined, error: null }), false);
});

test("linha presente e sem erro libera o acesso", () => {
  assert.equal(
    isAdminFromQuery({ data: { auth_user_id: "d64bdd16" }, error: null }),
    true,
  );
});

test("a lista de admins é vazia quando a leitura falha", () => {
  assert.deepEqual(normalizePlatformAdmins({ data: null, error: { message: "x" } }), []);
  assert.deepEqual(normalizePlatformAdmins({ data: [], error: null }), []);
  assert.deepEqual(normalizePlatformAdmins({ data: "nao-array", error: null }), []);
});

test("linha sem auth_user_id é descartada da lista", () => {
  // Uma entrada que não identifica ninguém não pode aparecer numa lista de auditoria.
  const out = normalizePlatformAdmins({
    data: [{ email: "orfa@exemplo.com" }, { auth_user_id: "ok", email: null }],
    error: null,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].authUserId, "ok");
});

test("email e note ausentes viram null, não undefined", () => {
  const out = normalizePlatformAdmins({
    data: [{ auth_user_id: "abc" }],
    error: null,
  });
  const expected: PlatformAdmin[] = [{ authUserId: "abc", email: null, note: null }];
  assert.deepEqual(out, expected);
});

test("email e note são preservados quando existem", () => {
  const out = normalizePlatformAdmins({
    data: [{ auth_user_id: "abc", email: "eu@exemplo.com", note: "fundador" }],
    error: null,
  });
  assert.deepEqual(out, [
    { authUserId: "abc", email: "eu@exemplo.com", note: "fundador" },
  ]);
});
